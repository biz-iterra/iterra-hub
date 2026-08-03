"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Pencil, UserPlus, X } from "lucide-react";

import {
  searchContactsForReferrer,
  updateBusinessCardReferral,
} from "@/actions/business-cards";
import { useToast } from "@/components/ui/toast";
import type { BusinessCardRef } from "@/types/relations";

type Candidate = { id: string; name: string; company: string | null };

/**
 * 名刺 1 枚の紹介者。
 *
 * 連絡先から選ぶ経路と自由記入の両方を持つ。連絡先として登録されていない
 * 紹介者（社外の人づて・イベント経由）もいるため、片方だけでも記録できる。
 *
 * 連絡先は 3,000 件近くあり一覧から選べないので、打ち込んだ文字で絞る。
 */
export function BusinessCardReferral({
  card,
  contactId,
}: {
  card: BusinessCardRef;
  contactId: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [memo, setMemo] = useState(card.referral_memo ?? "");
  const [picked, setPicked] = useState<Candidate | null>(
    card.referrer
      ? {
          id: card.referrer.id,
          name: [card.referrer.last_name, card.referrer.first_name]
            .filter(Boolean)
            .join(" "),
          company: null,
        }
      : null
  );

  const [keyword, setKeyword] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  // 打つたびに投げると無駄なので、手が止まってから引く
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (keyword.trim().length < 2) return;
    timer.current = setTimeout(async () => {
      const { data } = await searchContactsForReferrer(keyword, contactId);
      setCandidates(data ?? []);
    }, 300);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [keyword, contactId]);

  // 2 文字未満に戻したら候補を出さない。state を effect で消すと
  // 余分なレンダーを挟むため、表示する側で絞る
  const shownCandidates = keyword.trim().length < 2 ? [] : candidates;

  async function save() {
    setSaving(true);
    const { error } = await updateBusinessCardReferral(card.id, {
      referrerContactId: picked?.id ?? null,
      memo,
    });
    setSaving(false);

    if (error) {
      showToast({ type: "error", message: error });
      return;
    }
    showToast({ type: "success", message: "紹介者を保存しました" });
    setEditing(false);
    setKeyword("");
    setCandidates([]);
    router.refresh();
  }

  function cancel() {
    setMemo(card.referral_memo ?? "");
    setPicked(
      card.referrer
        ? {
            id: card.referrer.id,
            name: [card.referrer.last_name, card.referrer.first_name]
              .filter(Boolean)
              .join(" "),
            company: null,
          }
        : null
    );
    setKeyword("");
    setCandidates([]);
    setEditing(false);
  }

  if (!editing) {
    const hasAny = card.referrer || card.referral_memo;
    return (
      <span style={styles.row}>
        <span style={styles.label}>紹介者</span>
        {hasAny ? (
          <span style={styles.value}>
            {card.referrer && (
              <span>
                {[card.referrer.last_name, card.referrer.first_name]
                  .filter(Boolean)
                  .join(" ")}
              </span>
            )}
            {card.referral_memo && (
              <span style={styles.memo}>{card.referral_memo}</span>
            )}
          </span>
        ) : (
          <span style={styles.empty}>未設定</span>
        )}
        <button
          type="button"
          style={styles.iconBtn}
          className="hover:bg-[var(--color-bg-hover)]"
          onClick={() => setEditing(true)}
          aria-label="紹介者を編集"
        >
          <Pencil size={12} />
        </button>
      </span>
    );
  }

  return (
    <span style={styles.editor}>
      <span style={styles.label}>紹介者</span>

      {picked ? (
        <span style={styles.picked}>
          <UserPlus size={12} />
          {picked.name}
          {picked.company && <span style={styles.pickedCompany}>{picked.company}</span>}
          <button
            type="button"
            style={styles.clearBtn}
            onClick={() => setPicked(null)}
            aria-label="選んだ紹介者を外す"
          >
            <X size={11} />
          </button>
        </span>
      ) : (
        <>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="連絡先を氏名で探す（2 文字以上）"
            style={styles.input}
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          {shownCandidates.length > 0 && (
            <span style={styles.candidates}>
              {shownCandidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  style={styles.candidate}
                  className="hover:bg-[var(--color-bg-hover)]"
                  onClick={() => {
                    setPicked(c);
                    setKeyword("");
                    setCandidates([]);
                  }}
                >
                  {c.name}
                  {c.company && <span style={styles.pickedCompany}>{c.company}</span>}
                </button>
              ))}
            </span>
          )}
        </>
      )}

      <textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="紹介の経緯（連絡先に無い紹介者はここに書く）"
        rows={2}
        style={styles.textarea}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = "none";
        }}
      />

      <span style={styles.actions}>
        <button type="button" style={styles.saveBtn} onClick={save} disabled={saving}>
          {saving ? "保存中..." : "保存"}
        </button>
        <button
          type="button"
          style={styles.cancelBtn}
          className="hover:bg-[var(--color-bg-hover)]"
          onClick={cancel}
          disabled={saving}
        >
          やめる
        </button>
      </span>
    </span>
  );
}

const styles = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    marginTop: "0.25rem",
    fontSize: "0.75rem",
    flexWrap: "wrap",
  } as CSSProperties,
  label: {
    color: "var(--color-sumi500)",
    fontSize: "0.6875rem",
    flexShrink: 0,
  } as CSSProperties,
  value: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    color: "var(--color-sumi700)",
    flexWrap: "wrap",
  } as CSSProperties,
  memo: {
    color: "var(--color-sumi600)",
    fontSize: "0.6875rem",
  } as CSSProperties,
  empty: {
    color: "var(--color-sumi400)",
  } as CSSProperties,
  iconBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
    border: "none",
    backgroundColor: "transparent",
    color: "var(--color-sumi500)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  } as CSSProperties,
  editor: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
    marginTop: "0.5rem",
    padding: "0.625rem",
    backgroundColor: "var(--color-sumi50)",
    borderRadius: "var(--radius-sm)",
  } as CSSProperties,
  input: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.375rem 0.5rem",
    fontSize: "0.75rem",
    outline: "none",
    backgroundColor: "#fff",
    fontFamily: "inherit",
    transition: "box-shadow 0.15s",
  } as CSSProperties,
  candidates: {
    display: "flex",
    flexDirection: "column",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-sm)",
    backgroundColor: "#fff",
    overflow: "hidden",
  } as CSSProperties,
  candidate: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.375rem 0.5rem",
    border: "none",
    backgroundColor: "transparent",
    fontSize: "0.75rem",
    textAlign: "left",
    cursor: "pointer",
    color: "var(--color-text-body)",
  } as CSSProperties,
  picked: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-badge)",
    padding: "0.25rem 0.5rem",
    fontSize: "0.75rem",
  } as CSSProperties,
  pickedCompany: {
    color: "var(--color-sumi500)",
    fontSize: "0.6875rem",
  } as CSSProperties,
  clearBtn: {
    display: "inline-flex",
    border: "none",
    backgroundColor: "transparent",
    color: "var(--color-sumi500)",
    cursor: "pointer",
    padding: 0,
  } as CSSProperties,
  textarea: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.375rem 0.5rem",
    fontSize: "0.75rem",
    outline: "none",
    backgroundColor: "#fff",
    fontFamily: "inherit",
    resize: "vertical",
    transition: "box-shadow 0.15s",
  } as CSSProperties,
  actions: {
    display: "flex",
    gap: "0.375rem",
  } as CSSProperties,
  saveBtn: {
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-button)",
    padding: "0.3125rem 0.875rem",
    fontSize: "0.75rem",
    cursor: "pointer",
  } as CSSProperties,
  cancelBtn: {
    backgroundColor: "transparent",
    color: "var(--color-sumi600)",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.3125rem 0.875rem",
    fontSize: "0.75rem",
    cursor: "pointer",
  } as CSSProperties,
};
