"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { updateCompany, deleteCompany, suggestCompanyKana } from "@/actions/companies";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { isFieldValidationError } from "@/lib/errors";
import { formContainerClass, fieldGridClass, formFooterClass } from "@/lib/layout";
import { AddressesEditor } from "@/components/common/AddressesEditor";
import { FinancialInfoEditor } from "@/components/companies/FinancialInfoEditor";
import type { FinancialInfoRow } from "@/actions/financial-info";
import type { EntityAddress } from "@/types/relations";
import { RequiredMark } from "@/components/ui/RequiredMark";
import { isSoleProprietorSelected } from "@/lib/company-type";
import {
  CompanyDomainsSection,
  type CompanyDomainRow,
} from "./company-domains-section";

type SelectOption = { value: string; label: string };

type CompanyData = {
  /** 楽観ロック用。編集開始時点の値をそのまま保存時に送り返す */
  updated_at?: string | null;
  id: string;
  name: string;
  name_kana: string | null;
  representative_name: string | null;
  corporate_type_id: string | null;
  company_status_id: string | null;
  lead_source_id: string | null;
  corporate_number: string | null;
  invoice_registration_number: string | null;
  phone: string | null;
  fax: string | null;
  website_url: string | null;
  internal_memo: string | null;
};

type Masters = {
  corporateTypes: SelectOption[];
  leadSources: SelectOption[];
  companyStatuses: SelectOption[];
};

const styles = {
  container: formContainerClass,
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    color: "var(--color-sumi600)",
    fontSize: "0.875rem",
    textDecoration: "none",
    marginBottom: "0.75rem",
  } as CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1rem",
    marginBottom: "1.5rem",
    flexWrap: "wrap",
  } as CSSProperties,
  title: {
    color: "var(--color-text-title)",
    fontSize: "1.5rem",
    fontWeight: 700,
    margin: 0,
  } as CSSProperties,
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    padding: "1.5rem",
    marginBottom: "1.5rem",
  } as CSSProperties,
  sectionTitle: {
    color: "var(--color-text-title)",
    fontSize: "1rem",
    fontWeight: 600,
    margin: "0 0 1rem 0",
  } as CSSProperties,
  grid: fieldGridClass,
  label: {
    display: "block",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--color-sumi700)",
    marginBottom: "0.25rem",
  } as CSSProperties,
  input: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.5rem 0.75rem",
    width: "100%",
    fontSize: "0.875rem",
    outline: "none",
    backgroundColor: "#fff",
    fontFamily: "inherit",
  } as CSSProperties,
  btnPrimary: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1.25rem",
    border: "none",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: "0.875rem",
  } as CSSProperties,
  btnOutline: {
    backgroundColor: "transparent",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1.25rem",
    cursor: "pointer",
    fontSize: "0.875rem",
    color: "var(--color-text-body)",
  } as CSSProperties,
  btnDanger: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    backgroundColor: "var(--color-error)",
    color: "#fff",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1.25rem",
    border: "none",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: "0.875rem",
  } as CSSProperties,
  error: {
    color: "var(--color-error)",
    fontSize: "0.875rem",
    margin: "0.75rem 0 0 0",
  } as CSSProperties,
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  } as CSSProperties,
};

function onFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "var(--color-border-focus)";
  e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
}
function onBlur(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "var(--color-border-default)";
  e.currentTarget.style.boxShadow = "";
}

export function CompanyEditForm({
  company,
  masters,
  isAdmin,
  domains,
  addresses,
  financialInfo,
}: {
  company: CompanyData;
  masters: Masters;
  isAdmin: boolean;
  /** manager 未満には渡さない（null なら欄ごと出さない） */
  financialInfo: FinancialInfoRow[] | null;
  domains: CompanyDomainRow[];
  /** 住所マスタ経由。本体の保存とは独立して増減させる */
  addresses: EntityAddress[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [values, setValues] = useState({
    name: company.name ?? "",
    name_kana: company.name_kana ?? "",
    representative_name: company.representative_name ?? "",
    corporate_type_id: company.corporate_type_id ?? "",
    company_status_id: company.company_status_id ?? "",
    lead_source_id: company.lead_source_id ?? "",
    corporate_number: company.corporate_number ?? "",
    invoice_registration_number: company.invoice_registration_number ?? "",
    phone: company.phone ?? "",
    fax: company.fax ?? "",
    website_url: company.website_url ?? "",
    internal_memo: company.internal_memo ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  // 会社名を入力し終えたらフリガナの下書きを入れる。
  // 形態素解析の読みなので正確とは限らない。人が入れた値は上書きしない
  const fillKana = async () => {
    if (!values.name.trim() || values.name_kana.trim()) return;
    const { data } = await suggestCompanyKana(values.name);
    if (data) set("name_kana", data);
  };

  // 個人事業主は法人番号を持たないので、法人番号の欄と実在確認を出さない
  const isSoleProprietor = isSoleProprietorSelected(
    masters.corporateTypes,
    values.corporate_type_id
  );

  // 法人番号（13桁数字）を入力したらインボイス番号を T+法人番号 で自動補完。既に入力があれば上書きしない。
  const onCorporateNumberChange = (raw: string) => {
    setValues((v) => {
      const next = { ...v, corporate_number: raw };
      if (/^\d{13}$/.test(raw) && !v.invoice_registration_number) {
        next.invoice_registration_number = `T${raw}`;
      }
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload: Record<string, unknown> = {
      name: values.name,
      name_kana: values.name_kana || null,
      representative_name: values.representative_name || null,
      corporate_type_id: values.corporate_type_id || null,
      company_status_id: values.company_status_id,
      lead_source_id: values.lead_source_id || null,
      corporate_number: values.corporate_number || null,
      invoice_registered: !!values.invoice_registration_number,
      invoice_registration_number: values.invoice_registration_number || null,
      phone: values.phone || null,
      fax: values.fax || null,
      website_url: values.website_url || null,
      internal_memo: values.internal_memo || null,
      // 楽観ロック: 編集開始時点の updated_at を送り、他者更新があれば競合として弾く
      expected_updated_at: company.updated_at ?? undefined,
    };

    const result = await updateCompany(company.id, payload);
    setSaving(false);
    if (result.error) {
      if (isFieldValidationError(result.error)) {
        setError(result.error);
      } else {
        showToast({ type: "error", message: result.error });
      }
      return;
    }
    showToast({ type: "success", message: "保存しました" });
    router.push(`/companies/${company.id}`);
  };

  const handleDelete = async () => {
    const result = await deleteCompany(company.id);
    if (result.error) {
      return { error: result.error };
    }
    showToast({ type: "success", message: "事業者情報を削除しました" });
    router.push("/companies");
    return { error: null };
  };

  return (
    <div className={styles.container}>
      <Link
        href={`/companies/${company.id}`}
        className="hover:bg-[var(--color-bg-hover)]"
        style={{
          ...styles.backLink,
          padding: "0.125rem 0.375rem",
          margin: "-0.125rem -0.375rem",
          borderRadius: "var(--radius-sm)",
          transition: "background-color 0.15s",
        }}
      >
        <ArrowLeft size={16} />
        事業者情報詳細に戻る
      </Link>
      <div style={styles.headerRow}>
        <h1 style={styles.title}>事業者情報を編集</h1>
      </div>

      <form onSubmit={handleSubmit}>
        {/* 基本情報 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>基本情報</h2>
          <div className={styles.grid}>
            <div>
              {/* 個人事業主は法人ではないので「会社名」と呼ばない（§22.2.1） */}
              <label style={styles.label}>
                {isSoleProprietor ? "屋号" : "会社名"}
                <RequiredMark />
              </label>
              <input
                type="text"
                style={styles.input}
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                required
                onFocus={onFocus}
                onBlur={(e) => {
                  onBlur(e);
                  void fillKana();
                }}
              />
            </div>
            <div>
              <label style={styles.label}>フリガナ</label>
              <input
                type="text"
                style={styles.input}
                value={values.name_kana}
                onChange={(e) => set("name_kana", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            {/* 個人事業主は本人しかいないので代表者を別に持たない。
                代表者の連絡先への紐づけは詳細画面から行う（作成時点では
                その会社の連絡先がまだ無いため、ここは自由入力のまま） */}
            {!isSoleProprietor && (
              <div>
                <label style={styles.label}>代表者名</label>
                <input
                  type="text"
                  style={styles.input}
                  value={values.representative_name}
                  onChange={(e) => set("representative_name", e.target.value)}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
                <p
                  style={{
                    fontSize: "0.6875rem",
                    color: "var(--color-sumi500)",
                    margin: "0.25rem 0 0 0",
                  }}
                >
                  連絡先（法人代表）への紐づけは、作成後に詳細画面から選べます。
                </p>
              </div>
            )}
            <div>
              <label style={styles.label}>法人格</label>
              <select
                style={styles.input}
                value={values.corporate_type_id}
                onChange={(e) => set("corporate_type_id", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {masters.corporateTypes.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {/* 個人事業主は法人番号を持たない。インボイス登録番号は別途入力できる */}
            {!isSoleProprietor && (
              <div>
                <label style={styles.label}>法人番号（13桁）</label>
                <input
                  type="text"
                  style={styles.input}
                  placeholder="1234567890123"
                  value={values.corporate_number}
                  onChange={(e) => onCorporateNumberChange(e.target.value)}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
              </div>
            )}
            {/*
              ステータス（実在性）は法人番号 Web-API の照合結果で自動付与する。
              人が選べると照合結果と食い違うため、**編集項目としては出さない**
              （2026-08-04）。現在値は読み取りで見せる
            */}
            <div>
              <label style={styles.label}>ステータス</label>
              <input
                style={{ ...styles.input, backgroundColor: "var(--color-sumi50)" }}
                value={
                  masters.companyStatuses.find(
                    (o) => o.value === values.company_status_id
                  )?.label ?? "未確認"
                }
                readOnly
                aria-label="ステータス（自動付与）"
              />
              <p
                style={{
                  fontSize: "0.6875rem",
                  color: "var(--color-sumi500)",
                  margin: "0.25rem 0 0 0",
                }}
              >
                法人番号の照合結果から自動で決まります。
              </p>
            </div>
            <div>
              <label style={styles.label}>リードソース</label>
              <select
                style={styles.input}
                value={values.lead_source_id}
                onChange={(e) => set("lead_source_id", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {masters.leadSources.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {/* 担当者と社内担当者は別レコードへの紐づけなので詳細ページで直す */}
          </div>
        </div>

        {/* 住所。addresses マスタに持ち、本社・支店・請求先を分けて登録する */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>住所</h2>
          <AddressesEditor
            ownerType="company"
            ownerId={company.id}
            addresses={addresses}
          />
        </div>

        {/* 連絡先 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>連絡先</h2>
          <div className={styles.grid}>
            <div>
              <label style={styles.label}>代表電話</label>
              <input
                type="text"
                style={styles.input}
                value={values.phone}
                onChange={(e) => set("phone", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>FAX</label>
              <input
                type="text"
                style={styles.input}
                value={values.fax}
                onChange={(e) => set("fax", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={styles.label}>ホームページURL</label>
              <input
                type="url"
                style={styles.input}
                value={values.website_url}
                onChange={(e) => set("website_url", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
          </div>
        </div>

        {/* メールドメイン（保存ボタンとは独立して即時反映する） */}
        <CompanyDomainsSection companyId={company.id} initialDomains={domains} />

        {/* インボイス */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>インボイス</h2>
          <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", margin: "0 0 0.75rem 0" }}>
            登録番号の有無で登録ステータスを自動判定します。基本情報の法人番号を 13 桁入力すると登録番号が自動で補完されます。
          </p>
          <div>
            <label style={styles.label}>インボイス登録番号（T+13桁）</label>
            <input
              type="text"
              style={styles.input}
              placeholder="T1234567890123"
              value={values.invoice_registration_number}
              onChange={(e) => set("invoice_registration_number", e.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </div>
        </div>

        {/*
          金融機関情報。振込先は事業者に付くので、インボイス登録番号と同じくここに置く。
          口座番号を含むため、閲覧は manager 以上・変更は admin だけ。
        */}
        {financialInfo !== null && (
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>金融機関情報</h2>
            <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", margin: "0 0 0.75rem 0" }}>
              振込先の口座。複数登録でき、★ が主口座です。
              追加・削除はこの場で反映されます（下の「保存」を待ちません）。
            </p>
            <FinancialInfoEditor
              companyId={company.id}
              rows={financialInfo}
              editable={isAdmin}
            />
          </div>
        )}

        {/* メモ */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>メモ</h2>
          <textarea
            style={{ ...styles.input, minHeight: 120, resize: "vertical" }}
            value={values.internal_memo}
            onChange={(e) => set("internal_memo", e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <div className={formFooterClass}>
          <div>
            {isAdmin && (
              <button
                type="button"
                style={styles.btnDanger}
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
              >
                <Trash2 size={14} />
                削除
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <Link
              href={`/companies/${company.id}`}
              style={{ ...styles.btnOutline, textDecoration: "none" }}
            >
              キャンセル
            </Link>
            <button type="submit" style={styles.btnPrimary} disabled={saving}>
              <Save size={14} />
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        title="事業者情報を削除"
        message={`「${company.name}」を削除します。この操作は取り消せません。紐づく取引先が存在する場合は削除できません。`}
        confirmLabel="削除する"
        danger
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
