"use client";

import Link from "next/link";
import { useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  PlayCircle,
  UploadCloud,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  commitEightImport,
  dryRunEightImport,
  type EightImportPreview,
  type EightImportResult,
  type ImportBatchRow,
} from "@/actions/leads/eight-import";

type CrmUser = { id: string; full_name: string; role: string };

const styles = {
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    padding: "1.5rem",
  } as CSSProperties,
  title: {
    color: "var(--color-text-title)",
    fontSize: "1.5rem",
    fontWeight: 700,
    margin: 0,
  } as CSSProperties,
  sectionTitle: {
    color: "var(--color-text-title)",
    fontSize: "1rem",
    fontWeight: 600,
    margin: 0,
  } as CSSProperties,
  sub: { color: "var(--color-sumi600)", fontSize: "0.875rem" } as CSSProperties,
  btnPrimary: {
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    borderRadius: "var(--radius-button)",
    padding: "0.625rem 1.5rem",
    border: "none",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: "0.875rem",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
  } as CSSProperties,
  btnOutline: {
    backgroundColor: "transparent",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1.25rem",
    cursor: "pointer",
    fontSize: "0.875rem",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
  } as CSSProperties,
  btnDisabled: {
    backgroundColor: "var(--color-bg-disabled)",
    color: "var(--color-text-disabled)",
    cursor: "not-allowed",
  } as CSSProperties,
  statCard: {
    backgroundColor: "var(--color-bg-alt)",
    borderRadius: "var(--radius-md)",
    padding: "1rem",
  } as CSSProperties,
  statValue: {
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "var(--color-text-title)",
  } as CSSProperties,
  th: {
    backgroundColor: "var(--color-sumi50)",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--color-sumi700)",
    textAlign: "left" as const,
    padding: "0.625rem 0.75rem",
    whiteSpace: "nowrap" as const,
  } as CSSProperties,
  td: {
    padding: "0.625rem 0.75rem",
    fontSize: "0.875rem",
    borderBottom: "1px solid var(--color-border-default)",
    color: "var(--color-text-list)",
  } as CSSProperties,
  select: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.5rem 0.75rem",
    fontSize: "0.875rem",
    backgroundColor: "#fff",
    minWidth: 200,
  } as CSSProperties,
  // バッジ・アラートの配色は badges.tsx の段階色パレットと同じ方式:
  // 背景はトークン値（--color-success #10B981 / --color-warning #F59E0B / --color-error #EF4444）
  // 由来の rgba、文字色は WCAG AA（4.5:1）を満たすまで濃くした色を選定
  badgeNew: {
    backgroundColor: "rgba(16, 185, 129, 0.14)",
    color: "#047857",
    fontSize: "0.75rem",
    fontWeight: 600,
    padding: "0.125rem 0.5rem",
    borderRadius: "var(--radius-badge)",
  } as CSSProperties,
  badgeUpdate: {
    backgroundColor: "var(--color-sumi100)",
    color: "var(--color-sumi700)",
    fontSize: "0.75rem",
    fontWeight: 600,
    padding: "0.125rem 0.5rem",
    borderRadius: "var(--radius-badge)",
  } as CSSProperties,
  alertError: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "var(--radius-md)",
    padding: "0.875rem 1rem",
    color: "#B91C1C",
    fontSize: "0.875rem",
  } as CSSProperties,
  alertWarn: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    border: "1px solid rgba(245, 158, 11, 0.35)",
    borderRadius: "var(--radius-md)",
    padding: "0.875rem 1rem",
    color: "#8A6D1E",
    fontSize: "0.875rem",
  } as CSSProperties,
  alertOk: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    border: "1px solid rgba(16, 185, 129, 0.35)",
    borderRadius: "var(--radius-md)",
    padding: "0.875rem 1rem",
    color: "#047857",
    fontSize: "0.875rem",
  } as CSSProperties,
} as const;

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function EightImportView({
  currentUserId,
  users,
  batches,
}: {
  currentUserId: string;
  users: CrmUser[];
  batches: ImportBatchRow[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [ownerUserId, setOwnerUserId] = useState(currentUserId);
  const [preview, setPreview] = useState<EightImportPreview | null>(null);
  const [result, setResult] = useState<EightImportResult | null>(null);
  const [loading, setLoading] = useState<"dryrun" | "commit" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview(null);
    setResult(null);
    setFile(f);
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const runDryRun = async () => {
    if (!file) return;
    setLoading("dryrun");
    setResult(null);

    const fd = new FormData();
    fd.append("file", file);
    const res = await dryRunEightImport(fd);
    setLoading(null);

    if (res.error || !res.data) {
      showToast({ type: "error", message: res.error ?? "内容を確認できませんでした" });
      return;
    }
    setPreview(res.data);
  };

  const runCommit = async (): Promise<{ error: string | null }> => {
    if (!file || !preview) return { error: "取込対象がありません" };
    setLoading("commit");

    const fd = new FormData();
    fd.append("file", file);
    fd.append("ownerUserId", ownerUserId);
    const res = await commitEightImport(fd);
    setLoading(null);

    if (res.error || !res.data) {
      return { error: res.error ?? "取込に失敗しました" };
    }
    setResult(res.data);
    setPreview(null);
    return { error: null };
  };

  const ownerName = users.find((u) => u.id === ownerUserId)?.full_name ?? "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* ---- ヘッダー ---- */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <Link
          href="/admin"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.375rem 0.625rem",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.8125rem",
          }}
        >
          <ArrowLeft size={14} />
          マスタ・取込
        </Link>
        <h1 style={styles.title}>Eight 名刺データ取込</h1>
      </div>

      <p style={{ ...styles.sub, margin: 0 }}>
        Eight プレミアムでダウンロードした CSV をそのまま取り込めます（Shift_JIS のままで可）。
        同じ人と複数回名刺交換した行は 1 件のリードにまとめ、交換日は社内対応として残します。
      </p>

      {/* ---- 1. ファイル選択 ---- */}
      <div style={styles.card}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1rem",
          }}
        >
          <h2 style={styles.sectionTitle}>
            <span style={{ color: "var(--color-soleil)", marginRight: "0.5rem" }}>1.</span>
            CSV ファイルを選ぶ
          </h2>
          {file && (
            <button type="button" style={styles.btnOutline} onClick={reset}>
              やり直す
            </button>
          )}
        </div>

        {!file ? (
          <label
            htmlFor="eight-csv"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "2.5rem 1rem",
              border: "2px dashed var(--color-border-default)",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
            }}
          >
            <UploadCloud
              size={36}
              style={{ color: "var(--color-sumi500)", marginBottom: "0.5rem" }}
            />
            <p
              style={{
                ...styles.sub,
                marginBottom: "0.25rem",
                fontSize: "0.9375rem",
                fontWeight: 500,
                color: "var(--color-text-body)",
              }}
            >
              クリックして CSV を選択
            </p>
            <p style={styles.sub}>Eight の「名刺データをダウンロード」で出力したファイル</p>
            <input
              ref={fileInputRef}
              id="eight-csv"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
          </label>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              padding: "1rem",
              backgroundColor: "var(--color-bg-alt)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <FileText size={20} style={{ color: "var(--color-terra)" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: "var(--color-text-body)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {file.name}
              </div>
              <div style={styles.sub}>{(file.size / 1024).toFixed(0)} KB</div>
            </div>
          </div>
        )}
      </div>

      {/* ---- 2. 担当者 ---- */}
      {file && (
        <div style={styles.card}>
          <h2 style={{ ...styles.sectionTitle, marginBottom: "0.75rem" }}>
            <span style={{ color: "var(--color-soleil)", marginRight: "0.5rem" }}>2.</span>
            担当者を選ぶ
          </h2>
          <p style={{ ...styles.sub, marginBottom: "0.75rem" }}>
            取り込むリードの担当者になります。名刺交換の社内対応もこの担当者で記録します。
          </p>
          <select
            value={ownerUserId}
            onChange={(e) => setOwnerUserId(e.target.value)}
            style={styles.select}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ---- 3. 内容確認 ---- */}
      {file && (
        <div style={styles.card}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "1rem",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <h2 style={styles.sectionTitle}>
              <span style={{ color: "var(--color-soleil)", marginRight: "0.5rem" }}>3.</span>
              内容を確認する
            </h2>
            <button
              type="button"
              style={{
                ...styles.btnPrimary,
                ...(loading !== null ? styles.btnDisabled : {}),
              }}
              onClick={runDryRun}
              disabled={loading !== null}
            >
              <PlayCircle size={16} />
              {loading === "dryrun" ? "確認中..." : "内容を確認"}
            </button>
          </div>

          {!preview ? (
            <p style={styles.sub}>
              先に内容を確認します。この時点ではデータは登録されません。
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* 件数サマリ */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: "0.75rem",
                }}
              >
                <div style={styles.statCard}>
                  <div style={styles.sub}>CSV の行数</div>
                  <div style={styles.statValue}>{preview.rowCount.toLocaleString()}</div>
                </div>
                <div style={styles.statCard}>
                  <div style={styles.sub}>登録するリード</div>
                  <div style={styles.statValue}>{preview.leadCount.toLocaleString()}</div>
                </div>
                <div style={styles.statCard}>
                  <div style={styles.sub}>新規</div>
                  <div style={{ ...styles.statValue, color: "var(--color-success)" }}>
                    {preview.newCount.toLocaleString()}
                  </div>
                </div>
                <div style={styles.statCard}>
                  <div style={styles.sub}>既存に追記</div>
                  <div style={styles.statValue}>{preview.updateCount.toLocaleString()}</div>
                </div>
                <div style={styles.statCard}>
                  <div style={styles.sub}>取込できない行</div>
                  <div
                    style={{
                      ...styles.statValue,
                      color: preview.errorCount > 0 ? "var(--color-error)" : undefined,
                    }}
                  >
                    {preview.errorCount.toLocaleString()}
                  </div>
                </div>
              </div>

              <div style={styles.sub}>
                文字コード: <strong>{preview.encoding}</strong>
                {preview.mergedRowCount > 0 && (
                  <>
                    {" ／ "}
                    同じ人との複数回の名刺交換{" "}
                    <strong>{preview.mergedRowCount.toLocaleString()} 行</strong>
                    をリードにまとめます（交換履歴は全件残ります）
                  </>
                )}
              </div>

              {/* エラー行 */}
              {preview.errors.length > 0 && (
                <div style={styles.alertError}>
                  <strong style={{ display: "block", marginBottom: "0.375rem" }}>
                    次の行は取り込めません（{preview.errors.length} 件）
                  </strong>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                    {preview.errors.slice(0, 10).map((e) => (
                      <li key={e.rowNumber}>
                        {e.rowNumber} 行目: {e.reason}
                      </li>
                    ))}
                  </ul>
                  {preview.errors.length > 10 && (
                    <div style={{ marginTop: "0.375rem" }}>
                      ほか {preview.errors.length - 10} 件
                    </div>
                  )}
                </div>
              )}

              {/* 警告 */}
              {preview.warnings.length > 0 && (
                <div style={styles.alertWarn}>
                  <strong
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.375rem",
                      marginBottom: "0.375rem",
                    }}
                  >
                    <AlertTriangle size={15} />
                    注意が必要な行（{preview.warnings.length} 件）
                  </strong>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                    {preview.warnings.slice(0, 8).map((w) => (
                      <li key={w.rowNumber}>
                        {w.rowNumber} 行目: {w.messages.join(" / ")}
                      </li>
                    ))}
                  </ul>
                  {preview.warnings.length > 8 && (
                    <div style={{ marginTop: "0.375rem" }}>
                      ほか {preview.warnings.length - 8} 件（取込は行われます）
                    </div>
                  )}
                </div>
              )}

              {/* サンプル */}
              {preview.samples.length > 0 && (
                <div>
                  <div style={{ ...styles.sub, marginBottom: "0.5rem" }}>
                    先頭 {preview.samples.length} 件の確認
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={styles.th}>行</th>
                          <th style={styles.th}>リード名</th>
                          <th style={styles.th}>担当者名</th>
                          <th style={styles.th}>メール</th>
                          <th style={styles.th}>最終交換日</th>
                          <th style={styles.th}>名刺</th>
                          <th style={styles.th}>区分</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.samples.map((s) => (
                          <tr key={s.rowNumber}>
                            <td style={styles.td}>{s.rowNumber}</td>
                            <td style={styles.td}>{s.leadName}</td>
                            <td style={styles.td}>{s.personName ?? "—"}</td>
                            <td style={styles.td}>{s.email ?? "—"}</td>
                            <td style={styles.td}>{s.exchangedOn ?? "—"}</td>
                            <td style={styles.td}>
                              {s.cardCount > 1 ? `${s.cardCount} 枚` : "1 枚"}
                            </td>
                            <td style={styles.td}>
                              <span style={s.isNew ? styles.badgeNew : styles.badgeUpdate}>
                                {s.isNew ? "新規" : "追記"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---- 4. 実行 ---- */}
      {preview && preview.leadCount > 0 && (
        <div style={styles.card}>
          <h2 style={{ ...styles.sectionTitle, marginBottom: "0.75rem" }}>
            <span style={{ color: "var(--color-soleil)", marginRight: "0.5rem" }}>4.</span>
            取り込む
          </h2>
          <p style={{ ...styles.sub, marginBottom: "1rem" }}>
            既存のリードは<strong>空欄だけを補完</strong>します。CRM で入力済みの項目は
            名刺の値で上書きしません。同じ CSV を再度取り込んでも件数は増えません。
          </p>
          <button
            type="button"
            style={{
              ...styles.btnPrimary,
              ...(loading !== null ? styles.btnDisabled : {}),
            }}
            onClick={() => setConfirmOpen(true)}
            disabled={loading !== null}
          >
            <CheckCircle2 size={16} />
            {loading === "commit" ? "取込中..." : `${preview.leadCount} 件を取り込む`}
          </button>
        </div>
      )}

      {/* ---- 結果 ---- */}
      {result && (
        <div style={styles.alertOk}>
          <strong
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              marginBottom: "0.375rem",
            }}
          >
            <CheckCircle2 size={16} />
            取込が完了しました
          </strong>
          新規 {result.createdCount.toLocaleString()} 件 / 追記{" "}
          {result.updatedCount.toLocaleString()} 件
          {result.errorCount > 0 && ` / 取込できなかった行 ${result.errorCount} 件`}
          <div style={{ marginTop: "0.625rem" }}>
            <Link
              href="/leads"
              className="hover:bg-[var(--color-bg-hover)]"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                color: "var(--color-terra)",
                textDecoration: "none",
                padding: "0.375rem 0.625rem",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.8125rem",
              }}
            >
              リード一覧を見る
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      )}

      {/* ---- 取込履歴 ---- */}
      <div style={styles.card}>
        <h2 style={{ ...styles.sectionTitle, marginBottom: "1rem" }}>取込履歴</h2>
        {batches.length === 0 ? (
          <p style={styles.sub}>まだ取込の記録はありません。</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={styles.th}>取込日時</th>
                  <th style={styles.th}>ファイル</th>
                  <th style={styles.th}>文字コード</th>
                  <th style={styles.th}>行数</th>
                  <th style={styles.th}>新規</th>
                  <th style={styles.th}>追記</th>
                  <th style={styles.th}>エラー</th>
                  <th style={styles.th}>実行者</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td style={styles.td}>{formatDateTime(b.imported_at)}</td>
                    <td style={styles.td}>{b.file_name}</td>
                    <td style={styles.td}>{b.encoding}</td>
                    <td style={styles.td}>{b.row_count.toLocaleString()}</td>
                    <td style={styles.td}>{b.created_count.toLocaleString()}</td>
                    <td style={styles.td}>{b.updated_count.toLocaleString()}</td>
                    <td
                      style={{
                        ...styles.td,
                        color: b.error_count > 0 ? "var(--color-error)" : undefined,
                      }}
                    >
                      {b.error_count.toLocaleString()}
                    </td>
                    <td style={styles.td}>{b.imported_by_name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="名刺データを取り込みます"
        message={
          preview
            ? `${preview.leadCount} 件のリード（新規 ${preview.newCount} 件 / 既存に追記 ${preview.updateCount} 件）を「${ownerName}」の担当として登録します。よろしいですか。`
            : ""
        }
        confirmLabel="取り込む"
        onConfirm={runCommit}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
