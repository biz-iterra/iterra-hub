import Link from "next/link";
import { getEmailContactCandidates } from "@/actions/email-sync";
import { CandidatesView } from "./candidates-view";

export default async function ContactCandidatesPage() {
  const { data, error } = await getEmailContactCandidates({ status: "pending" });

  // 権限不足（member）もここに来る。一覧へ戻せるようにしておく
  if (error) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>{error}</p>
        <Link
          href="/contacts"
          style={{ color: "var(--color-terra)", textDecoration: "none" }}
        >
          連絡先一覧へ戻る
        </Link>
      </div>
    );
  }

  return <CandidatesView initialCandidates={data ?? []} />;
}
