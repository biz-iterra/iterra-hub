import { getContacts } from "@/actions/contacts";
import { getCurrentUser } from "@/actions/users";
import { TalentNewForm } from "./talent-new-form";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * タレントの新規作成。
 *
 * タレントは連絡先に 1:1 で付く人材特性情報なので、**必ず相手の連絡先が要る**。
 * 連絡先の詳細から「タレントとして登録」で来たときは `?contact_id=` が渡る。
 *
 * 画面自体が無く Server Action（createTalent）だけが存在する状態だったため、
 * 2026-08-04 に追加した（T-0028）。
 */
export default async function TalentNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.contact_id) ? params.contact_id[0] : params.contact_id;
  const initialContactId = raw && UUID_RE.test(raw) ? raw : "";

  const [meResult, contactsResult] = await Promise.all([
    getCurrentUser(),
    getContacts({ perPage: 1000 }),
  ]);

  // 連絡先の一覧は talent を含めて返るので、**まだタレントが無い人だけ**を候補にする
  // （1:1 なので二重登録は DB の UNIQUE で弾かれるが、選ばせない方が親切）
  type ContactRow = {
    id: string;
    last_name: string | null;
    first_name: string | null;
    talent?: unknown;
  };
  const rows = (contactsResult.data?.rows ?? []) as ContactRow[];
  const contacts = rows
    .filter((c) => !c.talent || (Array.isArray(c.talent) && c.talent.length === 0))
    .map((c) => ({
      value: c.id,
      label: [c.last_name, c.first_name].filter(Boolean).join(" ") || "（名称未設定）",
    }));

  return (
    <TalentNewForm
      contacts={contacts}
      initialContactId={initialContactId}
      canCreate={meResult.data?.role !== null}
    />
  );
}
