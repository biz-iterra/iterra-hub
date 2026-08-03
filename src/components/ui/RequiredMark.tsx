/**
 * 入力必須を示すラベル横の印。
 *
 * 見た目を 1 箇所に集約するために用意した。各フォームがラベル文字列へ
 * 直接 `*` を書いていると、色や有無が画面ごとにばらつく。
 *
 * どの欄に付けるかの正本は Zod スキーマ（`src/lib/validators/`）。
 * スキーマで必須にした欄には必ずこれを付け、任意にした欄には付けない。
 *
 * 記号だけだと読み上げでは「アスタリスク」としか伝わらないため、
 * 視覚的な印と読み上げ用の文言を分けている。
 */
export function RequiredMark() {
  return (
    <>
      <span
        aria-hidden="true"
        style={{ color: "var(--color-soleil)", marginLeft: "0.25rem" }}
      >
        *
      </span>
      <span className="sr-only">（必須）</span>
    </>
  );
}
