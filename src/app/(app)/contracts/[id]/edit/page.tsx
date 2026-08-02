import Link from "next/link";
import { getContract } from "@/actions/contracts";
import { getContractTypes } from "@/actions/masters";
import { getCurrentUser } from "@/actions/users";
import { ArrowLeft } from "lucide-react";
import { ContractEditForm } from "./contract-edit-form";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ContractEditPage({
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
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <ArrowLeft size={14} />
          契約一覧へ戻る
        </Link>
      </div>
    );
  }

  const meResult = await getCurrentUser();
  const role = meResult.data?.role ?? null;
  const isManagerOrAbove = role === "manager" || role === "admin";

  if (!isManagerOrAbove) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          編集権限がありません
        </p>
        <Link
          href={`/contracts/${id}`}
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <ArrowLeft size={14} />
          契約詳細に戻る
        </Link>
      </div>
    );
  }

  const [
    contractResult,
    contractTypesResult,
  ] = await Promise.all([
    getContract(id),
    getContractTypes(),
  ]);

  const contract = contractResult.data;
  if (!contract) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          契約が見つかりません
        </p>
        <Link
          href="/contracts"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <ArrowLeft size={14} />
          契約一覧へ戻る
        </Link>
      </div>
    );
  }

  type MasterItem = { id: string; name: string };

  const contractTypes = ((contractTypesResult.data ?? []) as MasterItem[]).map(
    (t) => ({ value: t.id, label: t.name })
  );

  const isAdmin = role === "admin";

  return (
    <ContractEditForm
      contract={contract}
      masters={{ contractTypes }}
      isAdmin={isAdmin}
    />
  );
}
