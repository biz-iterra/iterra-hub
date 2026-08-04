"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Plus, Search, Star, Trash2, X } from "lucide-react";
import { lookupPostalCode } from "@/actions/postal-code";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  addEntityAddress,
  deleteEntityAddress,
  setPrimaryEntityAddress,
  updateEntityAddress,
  type AddressInput,
  type AddressOwnerType,
} from "@/actions/entity-addresses";
import type { EntityAddress } from "@/types/relations";
import { autoGridClass } from "@/lib/layout";

/**
 * 住所の増減。連絡先・事業者情報・取引先で共通で使う。
 *
 * 住所は `addresses` に持ち、`entity_addresses` が相手と結ぶ。本社・支店・請求先を
 * 区別できるよう種別を持ち、主住所を 1 つ指定する。
 */

export const ADDRESS_LABELS = [
  { value: "main", text: "本社・主住所" },
  { value: "branch", text: "支店・事業所" },
  { value: "billing", text: "請求先" },
  { value: "shipping", text: "配送先" },
  { value: "home", text: "自宅" },
  { value: "other", text: "その他" },
] as const;

const PREFECTURES = [
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県",
  "埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県",
  "岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県",
  "鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県",
  "佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県",
];

const EMPTY: AddressInput = {
  postal_code: "",
  prefecture: "",
  city: "",
  address_line1: "",
  address_line2: "",
  label: "main",
  phone: "",
  fax: "",
};

export function AddressesEditor({
  ownerType,
  ownerId,
  addresses,
}: {
  ownerType: AddressOwnerType;
  ownerId: string;
  addresses: EntityAddress[];
}) {
  const router = useRouter();
  const { showToast } = useToast();

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<AddressInput>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<AddressInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<EntityAddress | null>(null);

  function set(key: keyof AddressInput, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  function setEdit(key: keyof AddressInput, value: string) {
    setEditDraft((d) => ({ ...d, [key]: value }));
  }

  async function add() {
    setBusy(true);
    const { error } = await addEntityAddress(ownerType, ownerId, draft);
    setBusy(false);
    if (error) {
      showToast({ type: "error", message: error });
      return;
    }
    setDraft(EMPTY);
    setAdding(false);
    showToast({ type: "success", message: "住所を追加しました" });
    router.refresh();
  }

  function startEdit(a: EntityAddress) {
    setEditing(a.id);
    setEditDraft({
      postal_code: a.address?.postal_code ?? "",
      prefecture: a.address?.prefecture ?? "",
      city: a.address?.city ?? "",
      address_line1: a.address?.address_line1 ?? "",
      address_line2: a.address?.address_line2 ?? "",
      label: a.label ?? "main",
      phone: a.phone ?? "",
      fax: a.fax ?? "",
    });
  }

  async function saveEdit(linkId: string) {
    setBusy(true);
    const { error } = await updateEntityAddress(ownerType, ownerId, linkId, editDraft);
    setBusy(false);
    if (error) {
      showToast({ type: "error", message: error });
      return;
    }
    setEditing(null);
    showToast({ type: "success", message: "住所を更新しました" });
    router.refresh();
  }

  async function makePrimary(a: EntityAddress) {
    const { error } = await setPrimaryEntityAddress(ownerType, ownerId, a.id);
    if (error) {
      showToast({ type: "error", message: error });
      return;
    }
    showToast({ type: "success", message: "主住所にしました" });
    router.refresh();
  }

  async function confirmDelete() {
    if (!target) return { error: "対象がありません" };
    const { error } = await deleteEntityAddress(ownerType, ownerId, target.id);
    if (error) return { error };
    setTarget(null);
    showToast({ type: "success", message: "住所を削除しました" });
    router.refresh();
    return { error: null };
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {addresses.length === 0 && !adding && (
          <p style={{ color: "var(--color-sumi500)", fontSize: "0.875rem", margin: 0 }}>
            住所は登録されていません
          </p>
        )}

        {addresses.map((a) =>
          editing === a.id ? (
            <div key={a.id} style={styles.editCard}>
              <AddressFields values={editDraft} onChange={setEdit} />
              <div style={styles.editActions}>
                <button
                  type="button"
                  style={styles.btnGhost}
                  onClick={() => setEditing(null)}
                >
                  <X size={14} />
                  やめる
                </button>
                <button
                  type="button"
                  style={{ ...styles.btnPrimary, ...(busy ? { opacity: 0.6 } : {}) }}
                  disabled={busy}
                  onClick={() => saveEdit(a.id)}
                >
                  更新する
                </button>
              </div>
            </div>
          ) : (
            <div key={a.id} style={styles.row}>
              <button
                type="button"
                title={a.is_primary ? "主住所" : "主住所にする"}
                aria-label={a.is_primary ? "主住所" : "主住所にする"}
                style={styles.starBtn}
                disabled={a.is_primary}
                onClick={() => makePrimary(a)}
              >
                <Star
                  size={14}
                  style={{
                    color: a.is_primary ? "var(--color-terra)" : "var(--color-sumi400)",
                  }}
                  fill={a.is_primary ? "var(--color-terra)" : "none"}
                />
              </button>

              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={styles.headline}>
                  <span style={styles.badge}>{labelText(a.label)}</span>
                  {a.address?.postal_code && (
                    <span style={styles.postal}>〒{a.address.postal_code}</span>
                  )}
                </span>
                <span style={styles.text}>{formatAddress(a) || "—"}</span>
                {(a.phone || a.fax) && (
                  <span style={styles.meta}>
                    {[a.phone && `TEL ${a.phone}`, a.fax && `FAX ${a.fax}`]
                      .filter(Boolean)
                      .join(" ・ ")}
                  </span>
                )}
              </span>

              <button type="button" style={styles.linkBtn} onClick={() => startEdit(a)}>
                編集
              </button>
              <button
                type="button"
                title="削除"
                aria-label="住所を削除"
                style={styles.delBtn}
                onClick={() => setTarget(a)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          )
        )}

        {adding ? (
          <div style={styles.editCard}>
            <AddressFields values={draft} onChange={set} />
            <div style={styles.editActions}>
              <button
                type="button"
                style={styles.btnGhost}
                onClick={() => {
                  setAdding(false);
                  setDraft(EMPTY);
                }}
              >
                <X size={14} />
                やめる
              </button>
              <button
                type="button"
                style={{ ...styles.btnPrimary, ...(busy ? { opacity: 0.6 } : {}) }}
                disabled={busy}
                onClick={add}
              >
                追加する
              </button>
            </div>
          </div>
        ) : (
          <button type="button" style={styles.addBtn} onClick={() => setAdding(true)}>
            <Plus size={14} />
            住所を追加
          </button>
        )}

        <p style={styles.note}>
          追加・削除はこの場で反映されます（下の「保存」を待ちません）。
        </p>
      </div>

      <ConfirmDialog
        open={target !== null}
        title="住所を削除します"
        message={
          target
            ? [
                `「${labelText(target.label)}」${formatAddress(target)} を削除します。`,
                target.is_primary && addresses.length > 1
                  ? "主住所のため、残りのうち最初に登録されたものが主になります。"
                  : "",
              ]
                .filter(Boolean)
                .join("\n")
            : ""
        }
        confirmLabel="削除する"
        danger
        onConfirm={confirmDelete}
        onClose={() => setTarget(null)}
      />
    </>
  );
}

function AddressFields({
  values,
  onChange,
}: {
  values: AddressInput;
  onChange: (key: keyof AddressInput, value: string) => void;
}) {
  const { showToast } = useToast();
  const [looking, setLooking] = useState(false);

  /**
   * 郵便番号から都道府県・市区町村・町域を引いて埋める。
   * **入力の補助でしかない**ので、失敗しても欄は触れるままにする
   * （外部サービスが落ちていても住所は手で入れられる）。
   */
  /**
   * Enter の扱い。
   *
   * **日本語入力の変換確定を奪わないこと。** `isComposing` の間に
   * preventDefault すると、変換中の文字が確定されずに検索が走り、
   * 変換前のテキストがそのまま入ってしまう（2026-08-04 に発生）。
   *
   * 変換が終わっている Enter だけを拾い、**フォームの送信は必ず止める**。
   * このエディタは form の中にあり、Enter で送信されると入力途中の住所が消える。
   */
  const handlePostalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    if (e.nativeEvent.isComposing) return; // 変換中は何もしない
    e.preventDefault();
    void lookup();
  };

  /** 住所の各欄。Enter でフォームが送信されると入力が消えるので止めるだけ */
  const blockEnterSubmit = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
    }
  };

  const lookup = async () => {
    setLooking(true);
    try {
      const res = await lookupPostalCode(values.postal_code ?? "");
      if (res.error || !res.data) {
        showToast({ type: "error", message: res.error ?? "住所を取得できませんでした" });
        return;
      }
      onChange("prefecture", res.data.prefecture);
      onChange("city", res.data.city);
      // 町域は番地の前まで。既に入力があるときは邪魔しない
      if (!values.address_line1) {
        onChange("address_line1", res.data.town);
      }
    } finally {
      setLooking(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
      <div className={autoGridClass}>
        <div>
          <label style={styles.label}>種別</label>
          <select
            style={styles.input}
            value={values.label ?? "main"}
            onChange={(e) => onChange("label", e.target.value)}
            aria-label="住所の種別"
          >
            {ADDRESS_LABELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.text}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={styles.label}>郵便番号</label>
          <div style={{ display: "flex", gap: "0.375rem" }}>
            <input
              style={{ ...styles.input, flex: 1, minWidth: 0 }}
              placeholder="000-0000"
            aria-label="郵便番号"
              value={values.postal_code ?? ""}
              onChange={(e) => onChange("postal_code", e.target.value)}
              onKeyDown={handlePostalKeyDown}
            />
            <button
              type="button"
              onClick={() => void lookup()}
              disabled={looking}
              title="郵便番号から住所を検索"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                border: "1px solid var(--color-border-default)",
                borderRadius: "var(--radius-input)",
                backgroundColor: "#fff",
                padding: "0 0.625rem",
                fontSize: "0.75rem",
                color: "var(--color-terra)",
                cursor: looking ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
                opacity: looking ? 0.6 : 1,
              }}
            >
              <Search size={13} />
              {looking ? "検索中" : "住所検索"}
            </button>
          </div>
        </div>
        <div>
          <label style={styles.label}>都道府県</label>
          <select
            style={styles.input}
            value={values.prefecture ?? ""}
            onChange={(e) => onChange("prefecture", e.target.value)}
            aria-label="都道府県"
            onKeyDown={blockEnterSubmit}
          >
            <option value="">-- 選択 --</option>
            {PREFECTURES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={styles.label}>市区町村</label>
          <input
            style={styles.input}
            value={values.city ?? ""}
            onChange={(e) => onChange("city", e.target.value)}
            aria-label="市区町村"
            onKeyDown={blockEnterSubmit}
          />
        </div>
        <div>
          <label style={styles.label}>番地</label>
          <input
            style={styles.input}
            value={values.address_line1 ?? ""}
            onChange={(e) => onChange("address_line1", e.target.value)}
            aria-label="町名・番地"
            onKeyDown={blockEnterSubmit}
          />
        </div>
        <div>
          <label style={styles.label}>建物名</label>
          <input
            style={styles.input}
            value={values.address_line2 ?? ""}
            onChange={(e) => onChange("address_line2", e.target.value)}
            aria-label="建物名・部屋番号"
            onKeyDown={blockEnterSubmit}
          />
        </div>
        <div>
          <label style={styles.label}>電話（この拠点）</label>
          <input
            style={styles.input}
            value={values.phone ?? ""}
            onChange={(e) => onChange("phone", e.target.value)}
          />
        </div>
        <div>
          <label style={styles.label}>FAX</label>
          <input
            style={styles.input}
            value={values.fax ?? ""}
            onChange={(e) => onChange("fax", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

export function labelText(label: string | null): string {
  return ADDRESS_LABELS.find((l) => l.value === label)?.text ?? "住所";
}

export function formatAddress(a: EntityAddress): string {
  const ad = a.address;
  if (!ad) return "";
  const joined = [ad.prefecture, ad.city, ad.address_line1, ad.address_line2]
    .filter(Boolean)
    .join(" ");
  // 名刺のように 1 行でしか取れなかった住所は原文を出す
  return joined || ad.raw_text || "";
}

const styles = {
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.5rem",
    padding: "0.625rem 0",
    borderBottom: "1px solid var(--color-border-default)",
  } as CSSProperties,
  headline: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.125rem",
  } as CSSProperties,
  badge: {
    backgroundColor: "var(--color-sumi100)",
    borderRadius: "var(--radius-badge)",
    padding: "0.125rem 0.5rem",
    fontSize: "0.625rem",
    color: "var(--color-sumi700)",
  } as CSSProperties,
  postal: {
    fontSize: "0.75rem",
    color: "var(--color-sumi600)",
  } as CSSProperties,
  text: {
    display: "block",
    fontSize: "0.875rem",
    color: "var(--color-text-body)",
  } as CSSProperties,
  meta: {
    display: "block",
    fontSize: "0.75rem",
    color: "var(--color-sumi600)",
    marginTop: "0.125rem",
  } as CSSProperties,
  starBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "0.125rem",
    display: "inline-flex",
    flexShrink: 0,
    marginTop: "0.125rem",
  } as CSSProperties,
  delBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "0.25rem",
    color: "var(--color-sumi500)",
    display: "inline-flex",
    flexShrink: 0,
  } as CSSProperties,
  linkBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--color-terra)",
    fontSize: "0.75rem",
    flexShrink: 0,
    padding: "0.25rem",
  } as CSSProperties,
  editCard: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-md)",
    padding: "0.875rem",
    backgroundColor: "var(--color-bg-alt)",
  } as CSSProperties,
  editActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "0.5rem",
    marginTop: "0.75rem",
  } as CSSProperties,
  label: {
    display: "block",
    fontSize: "0.75rem",
    color: "var(--color-sumi600)",
    marginBottom: "0.1875rem",
  } as CSSProperties,
  input: {
    width: "100%",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.4375rem 0.625rem",
    fontSize: "0.875rem",
    backgroundColor: "#fff",
  } as CSSProperties,
  addBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    alignSelf: "flex-start",
    backgroundColor: "transparent",
    color: "var(--color-sumi700)",
    border: "1px dashed var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.4375rem 0.875rem",
    fontSize: "0.8125rem",
    cursor: "pointer",
  } as CSSProperties,
  btnPrimary: {
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-button)",
    padding: "0.4375rem 1rem",
    fontSize: "0.8125rem",
    cursor: "pointer",
  } as CSSProperties,
  btnGhost: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    backgroundColor: "transparent",
    color: "var(--color-sumi600)",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.4375rem 0.875rem",
    fontSize: "0.8125rem",
    cursor: "pointer",
  } as CSSProperties,
  note: {
    fontSize: "0.6875rem",
    color: "var(--color-sumi500)",
    margin: 0,
  } as CSSProperties,
};

/** 詳細ページ用の読み取り専用表示 */
export function AddressList({ addresses }: { addresses: EntityAddress[] }) {
  if (addresses.length === 0) {
    return (
      <span style={{ color: "var(--color-sumi500)", fontSize: "0.875rem" }}>—</span>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {addresses.map((a) => (
        <div key={a.id} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
          <MapPin
            size={13}
            style={{ color: "var(--color-sumi500)", flexShrink: 0, marginTop: "0.1875rem" }}
          />
          <span style={{ minWidth: 0 }}>
            <span style={styles.headline}>
              <span style={styles.badge}>{labelText(a.label)}</span>
              {a.address?.postal_code && (
                <span style={styles.postal}>〒{a.address.postal_code}</span>
              )}
            </span>
            <span style={styles.text}>{formatAddress(a) || "—"}</span>
            {(a.phone || a.fax) && (
              <span style={styles.meta}>
                {[a.phone && `TEL ${a.phone}`, a.fax && `FAX ${a.fax}`]
                  .filter(Boolean)
                  .join(" ・ ")}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
