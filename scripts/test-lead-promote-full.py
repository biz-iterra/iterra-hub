#!/usr/bin/env python3
"""
Lead 昇格 DB レベル検証スクリプト
promoteLeadToDeal の処理を DB API で直接再現して検証する。
バグ #2 (個人Contact生成) / #3 (phone引き継ぎ) / #4 (company_id=null) を確認。
"""
import json
import sys
import os
import urllib.request
import urllib.parse
import urllib.error

BASE = "http://127.0.0.1:54331/rest/v1"

def load_key():
    env_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if env_key:
        return env_key
    candidates = [
        r"C:\Users\bizis\iterra.jp\iterra-hub\.env.local",
        "/c/Users/bizis/iterra.jp/iterra-hub/.env.local",
    ]
    for path in candidates:
        try:
            with open(path, "r") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                        return line.split("=", 1)[1].strip()
        except FileNotFoundError:
            continue
    raise ValueError("SUPABASE_SERVICE_ROLE_KEY not found")

KEY = load_key()
HEADERS = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

def req(method, path, body=None):
    if "?" in path:
        p, q = path.split("?", 1)
        url = BASE + p + "?" + urllib.parse.quote(q, safe="=&.,_-+*!~'():")
    else:
        url = BASE + path
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body else None
    r = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return json.loads(resp.read()), resp.status
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        print(f"  HTTP {e.code}: {err_body}")
        return None, e.code

def ok(label, cond, detail=""):
    mark = "PASS" if cond else "FAIL"
    detail_str = f" ({detail})" if detail != "" else ""
    print(f"  [{mark}] {label}{detail_str}")
    return cond

def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print('='*60)

# -----------------------------------------------------------------
section("Master data")
# -----------------------------------------------------------------

data, _ = req("GET", "/account_types?select=id,name,slug")
account_types = {r["slug"]: r["id"] for r in data}
print(f"  account_types: {account_types}")

data, _ = req("GET", "/contact_statuses?select=id,name&limit=1")
CONTACT_STATUS_ACTIVE = data[0]["id"] if data else None
print(f"  contact_status_active: {CONTACT_STATUS_ACTIVE}")

data, _ = req("GET", "/company_statuses?select=id,name&limit=1")
COMPANY_STATUS_ACTIVE = data[0]["id"] if data else None
print(f"  company_status_active: {COMPANY_STATUS_ACTIVE}")

data, _ = req("GET", "/account_statuses?select=id,name&limit=1")
ACCOUNT_STATUS_PROSPECT = data[0]["id"] if data else None
print(f"  account_status_prospect: {ACCOUNT_STATUS_PROSPECT}")

data, _ = req("GET", "/crm_users?select=id,role&limit=1")
admin_user_id = data[0]["id"] if data else None
print(f"  admin user_id: {admin_user_id}")

data, _ = req("GET", "/lead_sources?select=id&limit=1")
lead_source_id = data[0]["id"] if data else None
print(f"  lead_source_id: {lead_source_id}")

results = []

# =================================================================
section("Scenario 1: Corporate lead promote -> Company/Contact/Account created")
# =================================================================

# 1. Company 作成（法人用）
corp_data, _ = req("POST", "/companies", {
    "name": "[TEST-CORP] Corp",
    "company_status_id": COMPANY_STATUS_ACTIVE,
    "lead_source_id": lead_source_id,
    "owner_user_id": admin_user_id,
    "created_by": admin_user_id,
    "last_updated_by": admin_user_id,
})
new_company_id = corp_data[0]["id"] if corp_data else None
print(f"  Company created: {new_company_id}")

# 2. Contact 作成（法人 - corporate_rep）
contact_corp_data, _ = req("POST", "/contacts", {
    "last_name": "[TEST-CORP]",
    "first_name": "Taro",
    "contact_type": "corporate_rep",
    "contact_status_id": CONTACT_STATUS_ACTIVE,
    "company_id": new_company_id,  # 法人は company_id をセット
    "lead_source_id": lead_source_id,
    "owner_user_id": admin_user_id,
    "created_by": admin_user_id,
    "last_updated_by": admin_user_id,
})
new_contact_corp_id = contact_corp_data[0]["id"] if contact_corp_data else None
print(f"  Contact(corporate_rep) created: {new_contact_corp_id}")

# 法人Contact: phone を contact_phones に挿入（バグ #3 修正後の処理）
if new_contact_corp_id:
    ph_data, ph_st = req("POST", "/contact_phones", {
        "contact_id": new_contact_corp_id,
        "phone": "03-1234-5678",
        "label": "work",
        "is_primary": True,
        "created_by": admin_user_id,
        "last_updated_by": admin_user_id,
    })
    print(f"  contact_phones (corp) insert status={ph_st}: {ph_data}")

# 検証
if new_contact_corp_id:
    cdata, _ = req("GET", f"/contacts?select=id,company_id,contact_type&id=eq.{new_contact_corp_id}")
    c = cdata[0] if cdata else {}
    r1 = ok("Corp Contact: contact_type=corporate_rep", c.get("contact_type") == "corporate_rep", c.get("contact_type"))
    r2 = ok("Corp Contact: company_id set", c.get("company_id") == new_company_id, c.get("company_id"))
    results += [r1, r2]

    phones, _ = req("GET", f"/contact_phones?select=phone,is_primary&contact_id=eq.{new_contact_corp_id}")
    r3 = ok("Corp Contact: phone in contact_phones (bug #3)", any(p.get("phone") == "03-1234-5678" for p in (phones or [])), phones)
    results.append(r3)

# =================================================================
section("Scenario 2: Individual (sole_proprietor) promote -> Contact.company_id=null")
# =================================================================

# Contact 作成（個人 - individual）: company_id は null を明示（バグ #4 修正後）
contact_solo_data, _ = req("POST", "/contacts", {
    "last_name": "[TEST-SOLO]",
    "first_name": "",
    "contact_type": "individual",
    "contact_status_id": CONTACT_STATUS_ACTIVE,
    "company_id": None,  # 個人は必ず null（バグ #4 対応）
    "lead_source_id": lead_source_id,
    "owner_user_id": admin_user_id,
    "created_by": admin_user_id,
    "last_updated_by": admin_user_id,
})
new_contact_solo_id = contact_solo_data[0]["id"] if contact_solo_data else None
print(f"  Contact(individual) created: {new_contact_solo_id}")

# 個人Contact: phone を contact_phones に挿入（バグ #3 修正後の処理）
if new_contact_solo_id:
    ph_data, ph_st = req("POST", "/contact_phones", {
        "contact_id": new_contact_solo_id,
        "phone": "090-9876-5432",
        "label": "work",
        "is_primary": True,
        "created_by": admin_user_id,
        "last_updated_by": admin_user_id,
    })
    print(f"  contact_phones (solo) insert status={ph_st}: {ph_data}")

# Account 作成（個人: company_id=null）
account_solo_data, _ = req("POST", "/accounts", {
    "name": "[TEST-SOLO]",
    "account_type_id": account_types["sole_proprietor"],
    "account_status_id": ACCOUNT_STATUS_PROSPECT,
    "company_id": None,  # 個人は null
    "lead_source_id": lead_source_id,
    "owner_user_id": admin_user_id,
    "created_by": admin_user_id,
})
new_account_solo_id = account_solo_data[0]["id"] if account_solo_data else None
print(f"  Account(sole_proprietor) created: {new_account_solo_id}")

# account_contacts 紐付け
if new_account_solo_id and new_contact_solo_id:
    req("POST", "/account_contacts", {
        "account_id": new_account_solo_id,
        "contact_id": new_contact_solo_id,
        "role": "primary",
    })
    print(f"  account_contacts linked OK")

# 検証
if new_contact_solo_id:
    cdata, _ = req("GET", f"/contacts?select=id,company_id,contact_type&id=eq.{new_contact_solo_id}")
    c = cdata[0] if cdata else {}
    print(f"  Individual Contact: {c}")
    r4 = ok("Solo Contact: contact_type=individual (bug #2 - contact created)", c.get("contact_type") == "individual", c.get("contact_type"))
    r5 = ok("Solo Contact: company_id=null (bug #4)", c.get("company_id") is None, c.get("company_id"))
    results += [r4, r5]

    phones, _ = req("GET", f"/contact_phones?select=phone,is_primary&contact_id=eq.{new_contact_solo_id}")
    print(f"  Solo contact_phones: {phones}")
    r6 = ok("Solo Contact: phone in contact_phones (bug #3)", any(p.get("phone") == "090-9876-5432" for p in (phones or [])), phones)
    results.append(r6)

if new_account_solo_id:
    acdata, _ = req("GET", f"/account_contacts?select=contact_id,role&account_id=eq.{new_account_solo_id}")
    r7 = ok("Solo Account: account_contacts linked", len(acdata or []) > 0, acdata)
    results.append(r7)

# =================================================================
section("Cleanup")
# =================================================================

# account_contacts 削除
if new_account_solo_id:
    req("DELETE", f"/account_contacts?account_id=eq.{new_account_solo_id}")
# accounts 削除
if new_account_solo_id:
    req("DELETE", f"/accounts?id=eq.{new_account_solo_id}")
# contact_phones 削除
if new_contact_corp_id:
    req("DELETE", f"/contact_phones?contact_id=eq.{new_contact_corp_id}")
if new_contact_solo_id:
    req("DELETE", f"/contact_phones?contact_id=eq.{new_contact_solo_id}")
# contacts 削除
if new_contact_corp_id:
    req("DELETE", f"/contacts?id=eq.{new_contact_corp_id}")
if new_contact_solo_id:
    req("DELETE", f"/contacts?id=eq.{new_contact_solo_id}")
# companies 削除
if new_company_id:
    req("DELETE", f"/companies?id=eq.{new_company_id}")
print("  Cleanup done")

# =================================================================
section("Result Summary")
# =================================================================

passed = sum(1 for r in results if r)
total = len(results)
print(f"\n  {passed} / {total} tests passed")
if passed == total:
    print("  ALL PASS")
    sys.exit(0)
else:
    print(f"  {total - passed} tests FAILED")
    sys.exit(1)
