"use client";

import Link from "next/link";
import { useState, useRef, type ChangeEvent } from "react";
import { ArrowLeft, UploadCloud, FileText, CheckCircle2, AlertTriangle, PlayCircle } from "lucide-react";
import {
  dryRunInsideSalesImport,
  commitInsideSalesImport,
  type DryRunReport,
  type CommitReport,
} from "@/actions/deals/inside-sales-import";

// ===== Styles =====
const styles = {
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    padding: "1.5rem",
  } as React.CSSProperties,
  title: { color: "var(--color-text-title)", fontSize: "1.5rem", fontWeight: 700, margin: 0 } as React.CSSProperties,
  sectionTitle: { color: "var(--color-text-title)", fontSize: "1rem", fontWeight: 600, margin: 0 } as React.CSSProperties,
  sub: { color: "var(--color-sumi600)", fontSize: "0.875rem" } as React.CSSProperties,
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
  } as React.CSSProperties,
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
  } as React.CSSProperties,
  btnDisabled: {
    backgroundColor: "var(--color-bg-disabled)",
    color: "var(--color-text-disabled)",
    cursor: "not-allowed",
  } as React.CSSProperties,
  statCard: {
    backgroundColor: "var(--color-bg-alt)",
    borderRadius: "var(--radius-md)",
    padding: "1rem",
  } as React.CSSProperties,
  tableHeader: {
    backgroundColor: "var(--color-sumi50)",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--color-sumi700)",
    textAlign: "left" as const,
    padding: "0.625rem 0.75rem",
  } as React.CSSProperties,
  tableCell: {
    padding: "0.625rem 0.75rem",
    fontSize: "0.875rem",
    borderBottom: "1px solid var(--color-border-default)",
  } as React.CSSProperties,
  badgeError: {
    backgroundColor: "#FEF2F2",
    color: "var(--color-error)",
    fontSize: "0.75rem",
    fontWeight: 600,
    padding: "0.125rem 0.5rem",
    borderRadius: "9999px",
  } as React.CSSProperties,
  badgeWarn: {
    backgroundColor: "#FEF3C7",
    color: "#92400E",
    fontSize: "0.75rem",
    fontWeight: 600,
    padding: "0.125rem 0.5rem",
    borderRadius: "9999px",
  } as React.CSSProperties,
  badgeOk: {
    backgroundColor: "#ECFDF5",
    color: "var(--color-success)",
    fontSize: "0.75rem",
    fontWeight: 600,
    padding: "0.125rem 0.5rem",
    borderRadius: "9999px",
  } as React.CSSProperties,
};

export function ImportView({ currentUserId }: { currentUserId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [csvContent, setCsvContent] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState<DryRunReport | null>(null);
  const [commitResult, setCommitResult] = useState<CommitReport | null>(null);
  const [loading, setLoading] = useState<"dryrun" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setDryRun(null);
    setCommitResult(null);
    setFile(f);
    const text = await f.text();
    setCsvContent(text);
  };

  const reset = () => {
    setFile(null);
    setCsvContent(null);
    setDryRun(null);
    setCommitResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const runDryRun = async () => {
    if (!csvContent) return;
    setLoading("dryrun");
    setError(null);
    setCommitResult(null);
    const result = await dryRunInsideSalesImport(csvContent);
    setLoading(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDryRun(result.data);
  };

  const runCommit = async () => {
    if (!csvContent || !dryRun) return;
    if (!confirm(`${dryRun.valid_rows}件を投入します。実行してよろしいですか？`)) return;
    setLoading("commit");
    setError(null);
    const result = await commitInsideSalesImport(csvContent, currentUserId);
    setLoading(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCommitResult(result.data);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
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
            管理
          </Link>
          <h1 style={styles.title}>インサイドセールス CSV 取込</h1>
        </div>
      </div>

      {/* Step 1: File Upload */}
      <div style={styles.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h2 style={styles.sectionTitle}>
            <span style={{ color: "var(--color-soleil)", marginRight: "0.5rem" }}>1.</span>
            CSV ファイル選択
          </h2>
          {file && (
            <button style={styles.btnOutline} onClick={reset}>
              リセット
            </button>
          )}
        </div>

        {!file ? (
          <label
            htmlFor="csv-file"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "2.5rem 1rem",
              border: "2px dashed var(--color-border-default)",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              transition: "border-color 0.15s, background-color 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--color-soleil)";
              e.currentTarget.style.backgroundColor = "var(--color-bg-alt)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border-default)";
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <UploadCloud size={36} style={{ color: "var(--color-sumi500)", marginBottom: "0.5rem" }} />
            <p style={{ ...styles.sub, marginBottom: "0.25rem", fontSize: "0.9375rem", fontWeight: 500, color: "var(--color-text-body)" }}>
              クリックして CSV を選択
            </p>
            <p style={styles.sub}>または、ここにファイルをドロップ</p>
            <input
              ref={fileInputRef}
              id="csv-file"
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
            <FileText size={24} style={{ color: "var(--color-terra)" }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: "0.9375rem", fontWeight: 500, color: "var(--color-text-body)" }}>{file.name}</p>
              <p style={styles.sub}>{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              style={{
                ...styles.btnPrimary,
                ...(loading ? styles.btnDisabled : {}),
              }}
              onClick={runDryRun}
              disabled={loading !== null}
            >
              <PlayCircle size={16} />
              {loading === "dryrun" ? "解析中..." : "内容チェック"}
            </button>
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: "1rem",
              padding: "0.75rem 1rem",
              backgroundColor: "#FEF2F2",
              color: "var(--color-error)",
              borderRadius: "var(--radius-md)",
              fontSize: "0.875rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <AlertTriangle size={16} />
            {error}
          </div>
        )}
      </div>

      {/* Step 2: Dry-run result */}
      {dryRun && !commitResult && (
        <div style={styles.card}>
          <h2 style={{ ...styles.sectionTitle, marginBottom: "1rem" }}>
            <span style={{ color: "var(--color-soleil)", marginRight: "0.5rem" }}>2.</span>
            プレビュー結果
          </h2>

          {/* Stats */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "0.75rem",
              marginBottom: "1.5rem",
            }}
          >
            <StatBox label="総行数" value={dryRun.total_rows} />
            <StatBox label="有効行" value={dryRun.valid_rows} accent="success" />
            <StatBox label="エラー行" value={dryRun.error_rows} accent={dryRun.error_rows > 0 ? "error" : undefined} />
            <StatBox label="新規Company（推定）" value={dryRun.new_companies} />
            <StatBox label="既存Company再利用（推定）" value={dryRun.existing_companies_reused} />
          </div>

          {/* Unknown masters */}
          {dryRun.unknown_masters.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ ...styles.sub, fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                マスタ未登録
              </h3>
              <div style={{ border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={styles.tableHeader}>項目</th>
                      <th style={styles.tableHeader}>値</th>
                      <th style={{ ...styles.tableHeader, textAlign: "right" as const }}>件数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dryRun.unknown_masters.map((u, i) => (
                      <tr key={i}>
                        <td style={styles.tableCell}>{u.type}</td>
                        <td style={{ ...styles.tableCell, fontFamily: "var(--font-mono, monospace)" }}>{u.value}</td>
                        <td style={{ ...styles.tableCell, textAlign: "right" as const }}>{u.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sample errors */}
          {dryRun.sample_errors.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ ...styles.sub, fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                エラー行サンプル（最大20件）
              </h3>
              <div style={{ border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", overflow: "hidden", maxHeight: 320, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ ...styles.tableHeader, width: 80 }}>行番号</th>
                      <th style={styles.tableHeader}>エラー内容</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dryRun.sample_errors.map((e, i) => (
                      <tr key={i}>
                        <td style={styles.tableCell}>
                          <span style={styles.badgeError}>{e.row}</span>
                        </td>
                        <td style={styles.tableCell}>{e.messages.join(" / ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Commit button */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
            <button
              style={{
                ...styles.btnPrimary,
                ...(loading || dryRun.valid_rows === 0 ? styles.btnDisabled : {}),
                backgroundColor: dryRun.valid_rows === 0 ? "var(--color-bg-disabled)" : "var(--color-terra)",
              }}
              onClick={runCommit}
              disabled={loading !== null || dryRun.valid_rows === 0}
            >
              <CheckCircle2 size={16} />
              {loading === "commit" ? "投入中..." : `有効な ${dryRun.valid_rows} 件を投入`}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Commit result */}
      {commitResult && (
        <div style={styles.card}>
          <h2 style={{ ...styles.sectionTitle, marginBottom: "1rem" }}>
            <span style={{ color: "var(--color-soleil)", marginRight: "0.5rem" }}>3.</span>
            取込結果
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "0.75rem",
              marginBottom: "1rem",
            }}
          >
            <StatBox label="投入ディール" value={commitResult.imported_deals} accent="success" />
            <StatBox label="投入架電記録" value={commitResult.imported_calls} accent="success" />
            <StatBox label="失敗" value={commitResult.errors.length} accent={commitResult.errors.length > 0 ? "error" : undefined} />
          </div>

          {commitResult.errors.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <h3 style={{ ...styles.sub, fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                失敗した行
              </h3>
              <div style={{ border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", overflow: "hidden", maxHeight: 320, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ ...styles.tableHeader, width: 80 }}>行番号</th>
                      <th style={styles.tableHeader}>内容</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commitResult.errors.map((e, i) => (
                      <tr key={i}>
                        <td style={styles.tableCell}>
                          <span style={styles.badgeError}>{e.row}</span>
                        </td>
                        <td style={styles.tableCell}>{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
            <button style={styles.btnOutline} onClick={reset}>
              別のCSVを取込
            </button>
            <Link
              href="/deals"
              style={{
                ...styles.btnPrimary,
                textDecoration: "none",
              }}
            >
              ディール一覧へ
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== StatBox =====
function StatBox({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "success" | "error";
}) {
  const color =
    accent === "success"
      ? "var(--color-success)"
      : accent === "error"
      ? "var(--color-error)"
      : "var(--color-terra)";
  return (
    <div
      style={{
        backgroundColor: "var(--color-bg-alt)",
        borderRadius: "var(--radius-md)",
        padding: "0.875rem 1rem",
      }}
    >
      <p style={{ fontSize: "0.75rem", color: "var(--color-sumi700)", fontWeight: 500, marginBottom: "0.25rem" }}>
        {label}
      </p>
      <p style={{ fontSize: "1.5rem", fontWeight: 700, color, fontFamily: "var(--font-mono, monospace)" }}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}
