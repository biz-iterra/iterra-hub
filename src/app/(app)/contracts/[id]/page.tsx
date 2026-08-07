import { getContract, updateContract } from "@/actions/contracts";
import { getDeals } from "@/actions/deals";
import { getCompanies } from "@/actions/companies";
import { getContacts } from "@/actions/contacts";
import { getCrmUsers } from "@/actions/users";
import { buildCompanyOptions } from "@/lib/company-options";
import { RelationField } from "@/components/ui/RelationField";
import { getCurrentUser } from "@/actions/users";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Calendar,
  Building2,
  Pencil,
  Handshake,
  Paperclip,
  Layers,
} from "lucide-react";
import { ContractMethodBadge } from "@/components/ui/badges";
import { DetailSection } from "@/components/ui/DetailSection";
import { InfoField } from "@/components/ui/InfoField";
import { ExternalLinkText } from "@/components/ui/ExternalLinkText";
import { EntityLink } from "@/components/ui/EntityLink";
import { detailContainerClass, detailGridClass, fieldGridClass, sectionStackClass } from "@/lib/layout";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ja-JP");
}

/**
 * 金額の表示。
 *
 * **契約名の中は素の数字**（`1200000`）で、ここは通貨表記（`¥1,200,000`）。
 * 名前は CSV やファイル名で扱うことがあるので記号と桁区切りを入れない。
 */
function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          不正なパラメータです
        </p>
        <Link
          href="/contracts"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-terra)",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
            transition: "background-color 0.15s",
          }}
        >
          契約一覧へ戻る
        </Link>
      </div>
    );
  }

  const [
    { data: contract, error },
    meResult,
    { data: dealsResult },
    { data: companiesResult },
    { data: contactsResult },
    { data: users },
  ] = await Promise.all([
    getContract(id),
    getCurrentUser(),
    // 紐づけの付け替え用。編集ページと同じ範囲を出す
    getDeals({ perPage: 1000 }),
    getCompanies({ perPage: 1000 }),
    getContacts({ perPage: 1000 }),
    getCrmUsers(),
  ]);
  const role = meResult.data?.role ?? null;
  const isManagerOrAbove = role === "manager" || role === "admin";

  if (error || !contract) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          契約が見つかりません
        </p>
        <Link
          href="/contracts"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-sumi600)",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
            transition: "background-color 0.15s",
          }}
        >
          契約一覧へ戻る
        </Link>
      </div>
    );
  }

  // 紐づけの付け替え。編集ページ側からは外してあり、ここが唯一の入口になる。
  // 契約は manager 以上しか触れない
  const dealOptions = (dealsResult?.rows ?? []).map((d) => ({
    value: d.id,
    label: `${d.deal_code} ${d.name}`,
  }));
  const companyOptions = buildCompanyOptions(
    companiesResult?.rows ?? [],
    contract.counterparty_company ?? null
  );
  const contactOptions = (contactsResult?.rows ?? []).map((c) => ({
    value: c.id,
    label: `${c.last_name ?? ""} ${c.first_name ?? ""}`.trim() || "(無名)",
  }));
  const userOptions = (users ?? []).map((u) => ({ value: u.id, label: u.full_name }));

  /** 楽観ロックに使う updated_at は、この画面を出した時点の値で閉じ込める */
  async function saveRelation(
    field:
      | "deal_id"
      | "counterparty_company_id"
      | "counterparty_contact_id"
      | "counterparty_manager_id"
      | "registered_by",
    value: string | null
  ) {
    "use server";
    const { error: saveError } = await updateContract(id, {
      [field]: value,
      expected_updated_at: contract?.updated_at ?? undefined,
    });
    return { error: saveError };
  }

  return (
    <div className={detailContainerClass}>
      {/* ヘッダー */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/contracts"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            color: "var(--color-sumi600)",
            fontSize: "0.875rem",
            textDecoration: "none",
            marginBottom: "0.5rem",
          }}
        >
          <ArrowLeft size={16} />
          契約一覧
        </Link>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          {/*
            契約コードのチップは置かない。**契約名の末尾に必ず入る**ため重複する
            （T-0068）。コードは基本情報カードの「契約コード」で見る
          */}
          <h1
            style={{
              color: "var(--color-text-title)",
              fontSize: "1.5rem",
              fontWeight: 700,
              margin: 0,
              wordBreak: "break-all",
            }}
          >
            {contract.contract_display_name ??
              contract.contract_name ??
              contract.contract_code}
          </h1>
          {isManagerOrAbove && (
            <Link
              href={`/contracts/${contract.id}/edit`}
              style={{
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                backgroundColor: "var(--color-terra)",
                color: "#fff",
                borderRadius: "var(--radius-button)",
                padding: "0.5rem 1rem",
                textDecoration: "none",
                fontWeight: 500,
                fontSize: "0.875rem",
              }}
            >
              <Pencil size={14} />
              編集
            </Link>
          )}
        </div>
      </div>

      {/* 2カラム */}
      <div
        className={detailGridClass}
      >
        {/* 左カラム */}
        <div className={sectionStackClass}>
          {/* 基本情報カード */}
          <DetailSection title="基本情報" icon={FileText}>
            <div
              className={fieldGridClass}
            >
              {/* 締結日・契約書名・契約種別・金額・契約コードから自動で組み立てる */}
              <InfoField
                label="契約名（自動）"
                value={contract.contract_display_name}
                full
              />
              <InfoField label="契約コード" value={contract.contract_code} />
              <InfoField label="契約書名" value={contract.contract_name} />
              <InfoField label="金額" value={formatCurrency(contract.amount)} />
              <InfoField
                label="契約方法"
                value={<ContractMethodBadge method={contract.contract_method} />}
              />
              <InfoField label="契約種別" value={contract.contract_type?.name} />
              <InfoField label="契約内容" value={contract.contract_content} full />
            </div>
          </DetailSection>

          {/* 商談情報カード */}
          <DetailSection title="商談情報" icon={Handshake}>
            <RelationField
              label="商談"
              value={contract.deal_id}
              // 未選択に戻せる（T-0067）。どの商談にも紐づかない契約を持てる。
              // 「ステージは取引先なのに契約が無い」状態は DB のトリガーが拒む
              nullable
              emptyOptionLabel="-- 紐づけない --"
              display={
                contract.deal ? (
                  <EntityLink href={`/deals/${contract.deal.id}`}>
                    {contract.deal.deal_code} {contract.deal.name}
                  </EntityLink>
                ) : null
              }
              options={dealOptions}
              searchKind="deal"
              action={saveRelation.bind(null, "deal_id")}
              editable={isManagerOrAbove}
            />
          </DetailSection>

          {/* 契約相手先カード */}
          <DetailSection title="契約相手先" icon={Building2}>
            <div
              className={fieldGridClass}
            >
              <InfoField
                label="契約相手先区分"
                value={contract.counterparty_type === "company" ? "法人" : "個人"}
              />

              {contract.counterparty_type === "company" ? (
                <>
                  <RelationField
                    label="事業者情報"
                    value={contract.counterparty_company_id}
                    display={
                      contract.counterparty_company ? (
                        <EntityLink
                          href={`/companies/${contract.counterparty_company.id}`}
                        >
                          {contract.counterparty_company.name}
                        </EntityLink>
                      ) : null
                    }
                    options={companyOptions}
                    searchKind="company"
                    action={saveRelation.bind(null, "counterparty_company_id")}
                    editable={isManagerOrAbove}
                  />
                  <RelationField
                    label="契約担当者"
                    value={contract.counterparty_manager_id}
                    display={
                      contract.counterparty_manager
                        ? `${contract.counterparty_manager.last_name} ${contract.counterparty_manager.first_name}`
                        : null
                    }
                    options={contactOptions}
                    searchKind="contact"
                    action={saveRelation.bind(null, "counterparty_manager_id")}
                    editable={isManagerOrAbove}
                  />
                </>
              ) : (
                <RelationField
                  label="連絡先"
                  value={contract.counterparty_contact_id}
                  display={
                    contract.counterparty_contact ? (
                      <EntityLink
                        href={`/contacts/${contract.counterparty_contact.id}`}
                      >
                        {contract.counterparty_contact.last_name}{" "}
                        {contract.counterparty_contact.first_name}
                      </EntityLink>
                    ) : null
                  }
                  options={contactOptions}
                  searchKind="contact"
                  action={saveRelation.bind(null, "counterparty_contact_id")}
                  editable={isManagerOrAbove}
                />
              )}
            </div>
          </DetailSection>

          {/* 契約書URL カード */}
          <DetailSection title="契約書URL" icon={Paperclip}>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <InfoField
                label="原本URL"
                value={<ExternalLinkText value={contract.original_document_url} />}
              />
              <InfoField
                label="契約書URL"
                value={<ExternalLinkText value={contract.contract_url} />}
              />
            </div>
          </DetailSection>
        </div>

        {/* 右カラム */}
        <div className={sectionStackClass}>
          {/* 日程カード */}
          <DetailSection title="日程" icon={Calendar}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {[
                { label: "契約送付日", value: contract.sent_date },
                { label: "サインバック日", value: contract.signback_date },
                { label: "契約締結日", value: contract.execution_date },
                { label: "契約開始日", value: contract.start_date },
                { label: "契約終了日", value: contract.end_date },
                { label: "解約日", value: contract.cancellation_date },
              ].map((item) => (
                <InfoField
                  key={item.label}
                  label={item.label}
                  value={formatDate(item.value)}
                />
              ))}
            </div>
          </DetailSection>

          {/* ステータスカード */}
          <DetailSection title="ステータス" icon={Layers}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <InfoField
                label="自動更新"
                value={contract.auto_renewal ? "あり" : "なし"}
              />
              <RelationField
                label="登録者"
                value={contract.registered_by}
                display={contract.registered_user?.full_name ?? null}
                options={userOptions}
                action={saveRelation.bind(null, "registered_by")}
                editable={isManagerOrAbove}
              />
            </div>
          </DetailSection>
        </div>
      </div>
    </div>
  );
}
