"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Plug } from "lucide-react";
import { DetailSection } from "@/components/ui/DetailSection";
import { useToast } from "@/components/ui/toast";
import { saveCompanyIntegrationProfile } from "@/actions/integration-profiles";
import type { CompanyIntegrationProfileView } from "@/actions/integration-profiles";

/**
 * 連携プロファイル。
 *
 * **値ではなく「どのレコードを使うか」を選ぶ。** CRM 側を直せば連携値も追随する。
 * 未選択は「既定に従う」で、既定は主担当・主メール・主住所・主口座・代表電話。
 *
 * 同じ人が 2 社の担当者で、会社ごとにメールを使い分けている場合、
 * **主メールは連絡先に 1 つしか立たない**ため、ここで選ばないと片方が
 * 永久に差分として残る（2026-08-06 の指摘。T-0060）。
 */
export function IntegrationProfileSection({
  companyId,
  integration,
  view,
}: {
  companyId: string;
  integration: string;
  view: CompanyIntegrationProfileView;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    contactId: view.profile.contact_id ?? "",
    contactEmailId: view.profile.contact_email_id ?? "",
    entityAddressId: view.profile.entity_address_id ?? "",
    phoneEntityAddressId: view.profile.phone_entity_address_id ?? "",
    financialInfoId: view.profile.financial_info_id ?? "",
  });

  const set = (key: keyof typeof draft, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await saveCompanyIntegrationProfile({
        companyId,
        integration,
        contactId: draft.contactId || null,
        contactEmailId: draft.contactEmailId || null,
        entityAddressId: draft.entityAddressId || null,
        phoneEntityAddressId: draft.phoneEntityAddressId || null,
        financialInfoId: draft.financialInfoId || null,
      });
      if (res.error) {
        showToast({ type: "error", message: res.error });
        return;
      }
      showToast({ type: "success", message: "連携プロファイルを保存しました" });
      router.refresh();
    } catch {
      showToast({ type: "error", message: "連携プロファイルを保存できませんでした" });
    } finally {
      setSaving(false);
    }
  };

  const rows: {
    key: keyof typeof draft;
    label: string;
    options: { value: string; label: string }[];
    fallback: string | null;
  }[] = [
    {
      key: "contactId",
      label: "担当者",
      options: view.options.contacts,
      fallback: view.resolved.contact_name,
    },
    {
      key: "contactEmailId",
      label: "担当者メール",
      options: view.options.emails,
      fallback: view.resolved.contact_email,
    },
    {
      key: "phoneEntityAddressId",
      label: "電話",
      options: view.options.addresses,
      fallback: view.resolved.phone,
    },
    {
      key: "entityAddressId",
      label: "住所",
      options: view.options.addresses,
      fallback: [view.resolved.prefecture, view.resolved.street].filter(Boolean).join("") || null,
    },
    {
      key: "financialInfoId",
      label: "口座",
      options: view.options.financialInfos,
      fallback: [view.resolved.bank_name, view.resolved.account_number]
        .filter(Boolean)
        .join(" ") || null,
    },
  ];

  return (
    <DetailSection title="連携プロファイル（freee）" icon={Plug}>
      <p style={styles.lead}>
        freee へ渡す値をどのレコードから取るかの設定です。
        <strong>未選択は既定に従います</strong>（主担当・主メール・主住所・主口座・代表電話）。
      </p>

      <div style={styles.grid}>
        {rows.map((row) => (
          <div key={row.key}>
            <label style={styles.label} htmlFor={`profile-${row.key}`}>
              {row.label}
            </label>
            <select
              id={`profile-${row.key}`}
              style={styles.input}
              value={draft[row.key]}
              onChange={(e) => set(row.key, e.target.value)}
              disabled={saving}
              aria-label={`連携プロファイルの${row.label}`}
            >
              <option value="">-- 既定に従う --</option>
              {row.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {/* いま実際に渡っている値。既定に従っているときの確認に要る */}
            <p style={styles.current}>
              いま渡る値: {row.fallback ?? "（未設定）"}
            </p>
          </div>
        ))}
      </div>

      <div style={styles.actions}>
        {/* 同じ画面に RelationField の「保存」が複数あるので、名前で区別できるようにする */}
        <button
          type="button"
          style={styles.primary}
          onClick={handleSave}
          disabled={saving}
          aria-label="連携プロファイルを保存"
        >
          {saving ? "保存中..." : "保存"}
        </button>
      </div>

      <p style={styles.note}>
        担当者を選び直すと、選べるメールも変わります。保存後にこの欄を開き直してください。
        担当者の候補は<strong>この事業者に関わる連絡先</strong>（所属または兼務）だけです。
      </p>
    </DetailSection>
  );
}

const styles = {
  lead: {
    fontSize: "0.8125rem",
    color: "var(--color-sumi600)",
    margin: "0 0 0.875rem 0",
    lineHeight: 1.6,
  } as CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "0.875rem",
  } as CSSProperties,
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
  } as CSSProperties,
  current: {
    fontSize: "0.6875rem",
    color: "var(--color-sumi500)",
    margin: "0.25rem 0 0 0",
    wordBreak: "break-all",
  } as CSSProperties,
  actions: { display: "flex", justifyContent: "flex-end", marginTop: "1rem" } as CSSProperties,
  primary: {
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1.25rem",
    fontSize: "0.875rem",
    cursor: "pointer",
  } as CSSProperties,
  note: {
    fontSize: "0.75rem",
    color: "var(--color-sumi500)",
    marginTop: "0.75rem",
    marginBottom: 0,
    lineHeight: 1.6,
  } as CSSProperties,
};
