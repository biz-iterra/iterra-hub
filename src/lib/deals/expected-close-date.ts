/**
 * 商談のクローズ予定日（新規作成時のパイプライン別既定リードタイム）を計算する純粋関数。
 *
 * JS の Date は月末を超えて加算すると自動繰り上がる
 *（例: 2026-01-31 に 1 ヶ月を足すと 2026-03-03 になる）。
 * 業務上は「対象月の末日」に丸めたいため、加算後にクランプする。
 */
export function addMonthsClamped(base: Date, months: number): Date {
  const year = base.getFullYear();
  const month = base.getMonth();
  const day = base.getDate();

  const totalMonths = month + months;
  const targetYear = year + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;

  // 対象月の末日（翌月 0 日目 = 当月末日）
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);

  return new Date(targetYear, targetMonth, clampedDay);
}

/** <input type="date"> にバインドする YYYY-MM-DD 形式（ローカル日付基準）に変換する */
export function toDateInputValue(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * パイプラインの既定リードタイム（pipeline_types.default_close_months）から
 * クローズ予定日の初期値を算出する。NULL なら自動設定しない。
 */
export function calculateDefaultCloseDate(
  today: Date,
  defaultCloseMonths: number | null | undefined
): string | null {
  if (defaultCloseMonths == null) return null;
  return toDateInputValue(addMonthsClamped(today, defaultCloseMonths));
}
