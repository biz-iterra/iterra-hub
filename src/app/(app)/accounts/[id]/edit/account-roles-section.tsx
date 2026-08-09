"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { addAccountRole, removeAccountRole } from "@/actions/accounts";
import { LabelBadge } from "@/components/ui/badges";
import { useToast } from "@/components/ui/toast";

export type AccountRoleTypeOption = {
  id: string;
  name: string;
  definition: string | null;
  color: string | null;
  /** 契約成立で自動付与されるパイプライン。手動のみの区分は null */
  pipeline_name: string | null;
};

export type AssignedRole = {
  id: string;
  role_type_id: string;
  assigned_by_contract: boolean;
};

const styles = {
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    padding: "1.25rem",
    marginBottom: "1.5rem",
  } as CSSProperties,
  sectionTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "var(--color-text-title)",
    margin: "0 0 0.25rem 0",
  } as CSSProperties,
  hint: {
    fontSize: "0.75rem",
    color: "var(--color-sumi500)",
    margin: "0 0 1rem 0",
    lineHeight: 1.6,
  } as CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
  } as CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: "0.625rem",
    padding: "0.5rem 0.75rem",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-md)",
    cursor: "pointer",
  } as CSSProperties,
  definition: {
    fontSize: "0.75rem",
    color: "var(--color-sumi500)",
  } as CSSProperties,
  autoNote: {
    marginLeft: "auto",
    fontSize: "0.6875rem",
    color: "var(--color-sumi500)",
    whiteSpace: "nowrap",
  } as CSSProperties,
};

/**
 * 取引先区分の付け外し。
 *
 * 事業体の形態（種別）とは別軸で、1 社が顧客かつ仕入れ先といった重複を持てる。
 * 契約が成立するとディールのパイプラインに対応する区分がトリガーで自動付与されるため、
 * ここでの手動操作は補助的な位置づけ（自動で付かないパートナー区分など）。
 *
 * 保存ボタンとは独立して即時反映する。
 */
export function AccountRolesSection({
  accountId,
  roleTypes,
  initialRoles,
}: {
  accountId: string;
  roleTypes: AccountRoleTypeOption[];
  initialRoles: AssignedRole[];
}) {
  const { showToast } = useToast();
  const [roles, setRoles] = useState<AssignedRole[]>(initialRoles);
  const [isPending, startTransition] = useTransition();

  const assigned = new Map(roles.map((r) => [r.role_type_id, r]));

  function handleToggle(type: AccountRoleTypeOption) {
    const current = assigned.get(type.id);

    startTransition(async () => {
      if (current) {
        const { error } = await removeAccountRole(current.id);
        if (error) {
          showToast({ type: "error", message: error });
          return;
        }
        setRoles((prev) => prev.filter((r) => r.id !== current.id));
        showToast({ type: "success", message: `${type.name} を外しました` });
        return;
      }

      const { data, error } = await addAccountRole({
        account_id: accountId,
        role_type_id: type.id,
      });
      if (error || !data) {
        showToast({ type: "error", message: error ?? "区分の付与に失敗しました" });
        return;
      }
      setRoles((prev) => [
        ...prev,
        {
          id: data.id,
          role_type_id: data.role_type_id,
          assigned_by_contract: data.assigned_by_contract,
        },
      ]);
      showToast({ type: "success", message: `${type.name} を付与しました` });
    });
  }

  return (
    <div style={styles.card}>
      <h2 style={styles.sectionTitle}>区分</h2>
      <p style={styles.hint}>
        取引上の役割です。1 社に複数付けられます（顧客かつ仕入れ先など）。
        契約を登録すると、そのディールのパイプラインに対応する区分は自動で付きます。
      </p>

      <div style={styles.list}>
        {roleTypes.map((t) => {
          const current = assigned.get(t.id);
          return (
            <label key={t.id} style={styles.row}>
              <input
                type="checkbox"
                checked={Boolean(current)}
                onChange={() => handleToggle(t)}
                disabled={isPending}
              />
              <LabelBadge name={t.name} color={t.color} />
              {t.definition && <span style={styles.definition}>{t.definition}</span>}
              <span style={styles.autoNote}>
                {current?.assigned_by_contract
                  ? "契約により自動付与"
                  : t.pipeline_name
                    ? `${t.pipeline_name}の契約で自動付与`
                    : "手動のみ"}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
