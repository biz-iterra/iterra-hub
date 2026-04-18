"use client";

import { useState, useTransition } from "react";
import { Users, UserPlus, UserMinus, Sparkles } from "lucide-react";
import {
  addProjectMember,
  removeProjectMember,
  bulkAddMembersFromDeals,
} from "@/actions/projects";
import { getCrmUsers } from "@/actions/users";
import { useEffect } from "react";

type Member = {
  id: string;
  user_id: string;
  user: { id: string; full_name: string; email: string; role: string } | null;
};

export function ProjectMembersSection({
  projectId,
  initialMembers,
}: {
  projectId: string;
  initialMembers: Member[];
}) {
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [users, setUsers] = useState<{ id: string; full_name: string; role: string }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await getCrmUsers();
      if (res.data) setUsers(res.data);
    })();
  }, []);

  const memberUserIds = new Set(members.map((m) => m.user_id));
  const availableUsers = users.filter((u) => !memberUserIds.has(u.id));

  const handleAdd = () => {
    if (!selectedUserId) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await addProjectMember({ project_id: projectId, user_id: selectedUserId });
      if (result.error) {
        setError(result.error);
        return;
      }
      const user = users.find((u) => u.id === selectedUserId);
      if (user && result.data) {
        setMembers((prev) => [
          ...prev,
          {
            id: (result.data as { id: string }).id,
            user_id: user.id,
            user: { id: user.id, full_name: user.full_name, email: "", role: user.role },
          },
        ]);
      }
      setSelectedUserId("");
    });
  };

  const handleRemove = (userId: string) => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await removeProjectMember(projectId, userId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    });
  };

  const handleBulkAdd = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await bulkAddMembersFromDeals(projectId);
      if (result.error) {
        setError(result.error);
        return;
      }
      const added = (result.data as { added: number } | null)?.added ?? 0;
      setMessage(added > 0 ? `${added} 名を一括追加しました。再読み込みで反映されます。` : "追加対象はありません");
    });
  };

  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--elevation-low)",
        padding: "1.5rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
        <Users size={18} style={{ color: "var(--color-text-title)" }} />
        <h2 style={{ color: "var(--color-text-title)", fontSize: "1rem", fontWeight: 600, margin: 0 }}>
          メンバー（{members.length}名）
        </h2>
      </div>

      {/* 追加フォーム */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          className="text-sm outline-none"
          style={{
            flex: 1,
            border: "1px solid var(--color-border-default)",
            borderRadius: "var(--radius-input)",
            padding: "0.375rem 0.5rem",
            backgroundColor: "#fff",
          }}
        >
          <option value="">-- 追加するユーザー --</option>
          {availableUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}（{u.role}）
            </option>
          ))}
        </select>
        <button
          onClick={handleAdd}
          disabled={!selectedUserId || isPending}
          style={{
            backgroundColor: "var(--color-terra)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-button)",
            padding: "0.375rem 0.75rem",
            cursor: "pointer",
            fontSize: "0.75rem",
            fontWeight: 500,
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            opacity: !selectedUserId || isPending ? 0.5 : 1,
          }}
        >
          <UserPlus size={12} />
          追加
        </button>
      </div>

      {/* 一括追加 */}
      <button
        onClick={handleBulkAdd}
        disabled={isPending}
        style={{
          width: "100%",
          backgroundColor: "transparent",
          color: "var(--color-terra)",
          border: "1px dashed var(--color-border-default)",
          borderRadius: "var(--radius-button)",
          padding: "0.5rem 0.75rem",
          cursor: "pointer",
          fontSize: "0.75rem",
          fontWeight: 500,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.25rem",
          marginBottom: "0.75rem",
        }}
      >
        <Sparkles size={12} />
        配下ディールの担当者を一括追加
      </button>

      {error && (
        <p style={{ color: "var(--color-error)", fontSize: "0.75rem", margin: "0 0 0.5rem 0" }}>{error}</p>
      )}
      {message && (
        <p style={{ color: "var(--color-sage)", fontSize: "0.75rem", margin: "0 0 0.5rem 0" }}>{message}</p>
      )}

      {/* メンバー一覧 */}
      {members.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {members.map((m) => (
            <li
              key={m.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.5rem 0",
                borderBottom: "1px solid var(--color-border-default)",
              }}
            >
              <div>
                <div style={{ fontSize: "0.875rem", color: "var(--color-text-body)" }}>
                  {m.user?.full_name ?? "(不明)"}
                </div>
                {m.user?.role && (
                  <div style={{ fontSize: "0.7rem", color: "var(--color-sumi600)" }}>{m.user.role}</div>
                )}
              </div>
              <button
                onClick={() => handleRemove(m.user_id)}
                disabled={isPending}
                style={{
                  backgroundColor: "transparent",
                  color: "var(--color-error)",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                }}
              >
                <UserMinus size={12} />
                削除
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ color: "var(--color-sumi400)", fontSize: "0.875rem", margin: 0 }}>メンバーなし</p>
      )}
    </div>
  );
}
