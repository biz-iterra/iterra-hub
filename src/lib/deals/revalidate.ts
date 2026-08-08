import { revalidatePath } from "next/cache";

/**
 * 商談の一覧を再検証する。
 *
 * **一覧はパイプラインごとに画面が分かれている**（T-0073）ので、
 * `/deals` だけを再検証しても新しい画面には反映されない。
 * どのパイプラインか分からない場面（契約・リード側からの呼び出し）も
 * あるため、3 画面をまとめて再検証する。
 */
export function revalidateDealLists() {
  revalidatePath("/sales");
  revalidatePath("/procurement");
  revalidatePath("/partnership");
  // 既存のブックマーク（/sales へリダイレクトする）
  revalidatePath("/deals");
}
