"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Save, KeyRound } from "lucide-react";
import { updateOwnProfile } from "@/actions/users";
import { createClient } from "@/lib/supabase/client";
import { InfoField } from "@/components/ui/InfoField";
import { LabelBadge } from "@/components/ui/badges";
import { useToast } from "@/components/ui/toast";
import type { CrmUserRole } from "@/types/enums";
import { formContainerStyle } from "@/lib/layout";

type CurrentUser = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  updated_at: string;
};

const ROLE_LABELS: Record<CrmUserRole, string> = {
  member: "一般メンバー",
  manager: "マネージャー",
  admin: "管理者",
};

const styles = {
  container: formContainerStyle,
  title: {
    color: "var(--color-text-title)",
    fontSize: "1.5rem",
    fontWeight: 700,
    margin: "0 0 1.5rem 0",
  } as CSSProperties,
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    padding: "1.5rem",
    marginBottom: "1.5rem",
  } as CSSProperties,
  sectionTitle: {
    color: "var(--color-text-title)",
    fontSize: "1rem",
    fontWeight: 600,
    margin: "0 0 1rem 0",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  } as CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "1rem",
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
    fontFamily: "inherit",
  } as CSSProperties,
  btnPrimary: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1.25rem",
    border: "none",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: "0.875rem",
  } as CSSProperties,
  error: {
    color: "var(--color-error)",
    fontSize: "0.875rem",
    margin: "0.75rem 0 0 0",
  } as CSSProperties,
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "1rem",
  } as CSSProperties,
};

function onFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "var(--color-border-focus)";
  e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
}
function onBlur(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "var(--color-border-default)";
  e.currentTarget.style.boxShadow = "";
}

export function ProfileForm({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const { showToast } = useToast();

  // 基本情報
  const [fullName, setFullName] = useState(user.full_name);
  const [updatedAt, setUpdatedAt] = useState(user.updated_at);
  const [savingProfile, setSavingProfile] = useState(false);

  // パスワード変更
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  // フィールド単位のバリデーションエラー（8文字未満・不一致）はインライン表示のまま。
  // 保存処理そのものの成否（サーバー/DBエラー、成功）はトーストに統一する
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);

    const result = await updateOwnProfile({
      full_name: fullName,
      expected_updated_at: updatedAt,
    });
    setSavingProfile(false);

    if (result.error) {
      showToast({ type: "error", message: result.error });
      return;
    }
    if (result.data) {
      setUpdatedAt(result.data.updated_at);
      setFullName(result.data.full_name);
    }
    showToast({ type: "success", message: "表示名を更新しました" });
    router.refresh();
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword.length < 8) {
      setPasswordError("パスワードは8文字以上で入力してください");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("確認用パスワードが一致しません");
      return;
    }

    setSavingPassword(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);

    if (error) {
      showToast({ type: "error", message: `パスワードの変更に失敗しました: ${error.message}` });
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    showToast({ type: "success", message: "パスワードを変更しました" });
  };

  const roleKey = (user.role as CrmUserRole) in ROLE_LABELS ? (user.role as CrmUserRole) : "member";

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>プロフィール設定</h1>

      {/* 基本情報 */}
      <form onSubmit={handleSaveProfile}>
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>基本情報</h2>
          <div style={styles.grid}>
            <InfoField label="メールアドレス" value={user.email} />
            <InfoField label="ロール" value={<LabelBadge name={ROLE_LABELS[roleKey]} />} />
            <div>
              <label style={styles.label}>表示名 *</label>
              <input
                type="text"
                style={styles.input}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={100}
                required
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
          </div>

          <div style={styles.footer}>
            <button type="submit" style={styles.btnPrimary} disabled={savingProfile}>
              <Save size={14} />
              {savingProfile ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </form>

      {/* パスワード変更 */}
      <form onSubmit={handleChangePassword}>
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>
            <KeyRound size={16} />
            パスワード変更
          </h2>
          <div style={styles.grid}>
            <div>
              <label style={styles.label}>新しいパスワード *</label>
              <input
                type="password"
                style={styles.input}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>新しいパスワード（確認） *</label>
              <input
                type="password"
                style={styles.input}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
          </div>

          {passwordError && <p style={styles.error}>{passwordError}</p>}

          <div style={styles.footer}>
            <button type="submit" style={styles.btnPrimary} disabled={savingPassword}>
              <KeyRound size={14} />
              {savingPassword ? "変更中..." : "パスワードを変更"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
