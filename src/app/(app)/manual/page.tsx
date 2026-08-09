/*
 * Table / SectionHeader などのコンポーネント側で <tr key> / <td key> を付与しているため、
 * rows 配列に直接書いた JSX（<Code>, <Badge>）に key は不要。
 * react/jsx-key はこれを配列要素と見なして誤検知するため、本ファイルのみ無効化する。
 */
/* eslint-disable react/jsx-key */
import {
  BookOpen,
  LogIn,
  LayoutGrid,
  Gauge,
  Megaphone,
  UserSearch,
  Handshake,
  Users,
  Building2,
  Briefcase,
  UserCircle,
  Settings,
  Pencil,
  ShieldCheck,
  LifeBuoy,
  ChevronRight,
  Link2,
} from "lucide-react";

// ===============================
// 再利用する小コンポーネント
// ===============================

function Card({
  children,
  id,
  style,
}: {
  children: React.ReactNode;
  id?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section
      id={id}
      className="p-6 md:p-8 scroll-mt-20"
      style={{
        backgroundColor: "var(--color-bg-surface)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--elevation-low)",
        ...style,
      }}
    >
      {children}
    </section>
  );
}

function SectionHeader({
  number,
  icon: Icon,
  title,
  caption,
}: {
  number: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  title: string;
  caption: string;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-2">
        <div
          className="flex items-center justify-center"
          style={{
            width: 40,
            height: 40,
            backgroundColor: "var(--color-terra)",
            borderRadius: "var(--radius-md)",
            color: "#fff",
          }}
        >
          <Icon size={20} style={{ color: "#fff" }} />
        </div>
        <p
          className="text-xs font-bold uppercase"
          style={{
            color: "var(--color-soleil)",
            letterSpacing: "0.12em",
          }}
        >
          {caption}
        </p>
      </div>
      <h2
        className="text-2xl font-bold"
        style={{ color: "var(--color-text-title)" }}
      >
        <span
          className="mr-3 text-sm font-mono"
          style={{ color: "var(--color-sumi500)" }}
        >
          {number}
        </span>
        {title}
      </h2>
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="text-base font-bold mt-6 mb-3"
      style={{ color: "var(--color-text-title)" }}
    >
      {children}
    </h3>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-sm leading-7 mb-3"
      style={{ color: "var(--color-text-body)" }}
    >
      {children}
    </p>
  );
}

function UList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2 mb-3">
      {items.map((it, i) => (
        <li
          key={i}
          className="flex gap-2 text-sm leading-7"
          style={{ color: "var(--color-text-body)" }}
        >
          <span style={{ color: "var(--color-soleil)" }}>•</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-3 mb-4">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span
            className="flex-shrink-0 flex items-center justify-center text-xs font-bold"
            style={{
              width: 24,
              height: 24,
              backgroundColor: "var(--color-terra)",
              color: "#fff",
              borderRadius: "9999px",
            }}
          >
            {i + 1}
          </span>
          <span
            className="text-sm leading-7 pt-0.5"
            style={{ color: "var(--color-text-body)" }}
          >
            {it}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warning" | "error" | "success";
  title?: string;
  children: React.ReactNode;
}) {
  const colors = {
    info: { bg: "rgba(59,130,246,0.08)", border: "var(--color-info)", text: "#1E40AF" },
    warning: { bg: "rgba(245,158,11,0.1)", border: "var(--color-warning)", text: "#92400E" },
    error: { bg: "rgba(239,68,68,0.08)", border: "var(--color-error)", text: "#991B1B" },
    success: { bg: "rgba(16,185,129,0.08)", border: "var(--color-success)", text: "#065F46" },
  }[tone];
  return (
    <div
      className="p-4 my-4 text-sm leading-7"
      style={{
        backgroundColor: colors.bg,
        borderLeft: `3px solid ${colors.border}`,
        borderRadius: "var(--radius-md)",
        color: colors.text,
      }}
    >
      {title && <p className="font-bold mb-1">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto mb-4">
      <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ backgroundColor: "var(--color-sumi50)" }}>
            {headers.map((h, i) => (
              <th
                key={i}
                className="text-left px-3 py-2 font-semibold text-xs"
                style={{ color: "var(--color-sumi700)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              style={{ borderBottom: "1px solid var(--color-border-default)" }}
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="px-3 py-2 align-top"
                  style={{ color: "var(--color-text-body)" }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "terra" | "soleil" | "sage" | "amber" | "success" | "warning" | "error";
  children: React.ReactNode;
}) {
  const map = {
    neutral: { bg: "var(--color-sumi100)", text: "var(--color-sumi700)" },
    terra: { bg: "rgba(60,63,88,0.1)", text: "var(--color-terra)" },
    soleil: { bg: "rgba(215,119,93,0.12)", text: "#A34E35" },
    sage: { bg: "rgba(122,165,146,0.14)", text: "#4D7A65" },
    amber: { bg: "rgba(229,196,127,0.22)", text: "#8A6D1E" },
    success: { bg: "rgba(16,185,129,0.12)", text: "#047857" },
    warning: { bg: "rgba(245,158,11,0.14)", text: "#B45309" },
    error: { bg: "rgba(239,68,68,0.1)", text: "#991B1B" },
  }[tone];
  return (
    <span
      className="inline-block text-xs font-medium"
      style={{
        backgroundColor: map.bg,
        color: map.text,
        padding: "0.125rem 0.5rem",
        borderRadius: "var(--radius-badge)",
      }}
    >
      {children}
    </span>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="font-mono text-xs"
      style={{
        backgroundColor: "var(--color-sumi50)",
        color: "var(--color-terra)",
        padding: "0.1rem 0.4rem",
        borderRadius: "var(--radius-sm)",
      }}
    >
      {children}
    </code>
  );
}

// ===============================
// 目次定義
// ===============================

const TOC = [
  { id: "section-1", no: "01", label: "はじめに", icon: BookOpen },
  { id: "section-2", no: "02", label: "ログインとロール", icon: LogIn },
  { id: "section-3", no: "03", label: "画面全体の構成", icon: LayoutGrid },
  { id: "section-4", no: "04", label: "ダッシュボード", icon: Gauge },
  { id: "section-5", no: "05", label: "マーケティング（リード・キャンペーン）", icon: UserSearch },
  { id: "section-6", no: "06", label: "営業（ディール・プロジェクト・契約）", icon: Handshake },
  { id: "section-7", no: "07", label: "顧客情報（連絡先・事業者情報 他）", icon: Users },
  { id: "section-8", no: "08", label: "マスタ・取込（マスタ管理）", icon: Settings },
  { id: "section-9", no: "09", label: "編集・削除の共通ルール", icon: Pencil },
  { id: "section-10", no: "10", label: "アクセス制御と見え方", icon: ShieldCheck },
  { id: "section-11", no: "11", label: "よくあるトラブルと対処", icon: LifeBuoy },
  {
    id: "section-12",
    no: "12",
    label: "外部連携（Gmail・Google コンタクト・freee 会計）",
    icon: Link2,
  },
];

// ===============================
// ページ本体
// ===============================

export default function ManualPage() {
  return (
    <div className="max-w-6xl mx-auto">
      {/* ===== ヒーローカード ===== */}
      <div
        className="relative overflow-hidden mb-8 p-8 md:p-10"
        style={{
          backgroundColor: "var(--color-terra)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--elevation-mid)",
        }}
      >
        <div
          className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-40"
          style={{
            background:
              "radial-gradient(circle, var(--color-soleil) 0%, transparent 70%)",
            transform: "translate(30%, -30%)",
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-60 h-60 rounded-full opacity-20"
          style={{
            background:
              "radial-gradient(circle, var(--color-amber) 0%, transparent 70%)",
            transform: "translate(-30%, 30%)",
          }}
        />
        <div className="relative">
          <p
            className="text-xs font-bold uppercase mb-3"
            style={{ color: "var(--color-soleil)", letterSpacing: "0.2em" }}
          >
            ITERRA CRM · Operation Manual
          </p>
          <h1
            className="text-3xl md:text-4xl font-bold mb-3"
            style={{ color: "#fff" }}
          >
            運用マニュアル
          </h1>
          <p
            className="text-sm md:text-base leading-7 max-w-2xl"
            style={{ color: "rgba(255,255,255,0.8)" }}
          >
            リード獲得から受注・契約・プロジェクト管理までを一気通貫で追う
            統合 CRM の操作手順を、作業フロー付きで網羅する。
          </p>
          <div className="flex items-center gap-3 mt-5">
            <Badge tone="amber">最終更新 2026-08-09</Badge>
            <Badge tone="sage">バージョン main</Badge>
          </div>
        </div>
      </div>

      {/* ===== 目次 ===== */}
      <Card style={{ marginBottom: 32 }}>
        <div className="flex items-center gap-2 mb-4">
          <p
            className="text-xs font-bold uppercase"
            style={{
              color: "var(--color-soleil)",
              letterSpacing: "0.12em",
            }}
          >
            Contents
          </p>
        </div>
        <h2
          className="text-lg font-bold mb-4"
          style={{ color: "var(--color-text-title)" }}
        >
          目次
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {TOC.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="flex items-center gap-3 px-3 py-2.5 transition-colors group"
                style={{
                  borderRadius: "var(--radius-md)",
                  color: "var(--color-text-body)",
                }}
              >
                <span
                  className="flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 32,
                    height: 32,
                    backgroundColor: "var(--color-sumi50)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--color-terra)",
                  }}
                >
                  <Icon size={16} />
                </span>
                <span
                  className="text-xs font-mono flex-shrink-0"
                  style={{ color: "var(--color-sumi500)" }}
                >
                  {item.no}
                </span>
                <span className="text-sm font-medium flex-1">{item.label}</span>
                <ChevronRight
                  size={14}
                  style={{ color: "var(--color-sumi400)" }}
                />
              </a>
            );
          })}
        </div>
      </Card>

      {/* ===== セクション ===== */}
      <div className="space-y-8">
        {/* --- 1. はじめに --- */}
        <Card id="section-1">
          <SectionHeader
            number="01"
            icon={BookOpen}
            title="はじめに"
            caption="Introduction"
          />
          <SubHeading>何ができるシステムか</SubHeading>
          <Paragraph>
            ITERRA CRM は「リードの獲得 → 育成 → ディール昇格 → 受注 →
            プロジェクト／契約管理」までを 1
            画面で追う統合型の顧客管理システム。従来の CRM に加え、
            <strong>マーケティング（マーケティングオートメーション）</strong> と{" "}
            <strong>営業（セールスフォースオートメーション）</strong>{" "}
            を同居させている。
          </Paragraph>
          <UList
            items={[
              <>
                <strong>マーケティング層</strong>:
                リードの温度感・ステージ・コール履歴・キャンペーン紐付け。
              </>,
              <>
                <strong>営業層</strong>:
                ディールのパイプライン進捗・プロジェクト・契約。
              </>,
              <>
                <strong>顧客情報層</strong>:
                連絡先・事業者情報・取引先・タレント。
              </>,
              <>
                <strong>ポテンシャル診断</strong>:
                生年月日から自動算出する性質分析（タレント／連絡先）。
              </>,
            ]}
          />

          <SubHeading>本マニュアルの読み方</SubHeading>
          <Paragraph>
            各章は <strong>「何ができるか」→「画面」→「作業フロー」→「注意点」</strong>{" "}
            の順で構成している。はじめて触る場合は第 2〜4 章 →
            自分の業務に関連する章の順で読むと迷わない。
          </Paragraph>
        </Card>

        {/* --- 2. ログイン --- */}
        <Card id="section-2">
          <SectionHeader
            number="02"
            icon={LogIn}
            title="ログインとロール"
            caption="Access"
          />
          <SubHeading>ログイン</SubHeading>
          <Steps
            items={[
              "ブラウザで CRM の URL にアクセスする。",
              <>
                未認証の場合、自動的に <Code>/login</Code>{" "}
                にリダイレクトされる（Middleware による制御）。
              </>,
              "メールアドレスとパスワードを入力してログインする。",
              "認証成功後、ロールに応じた初期画面（ダッシュボード）に遷移する。",
            ]}
          />

          <SubHeading>ロールごとにできること</SubHeading>
          <Table
            headers={["ロール", "参照範囲", "主要操作", "マスタ", "契約"]}
            rows={[
              [
                <Badge tone="neutral">member</Badge>,
                "自分が社内担当者のレコードのみ",
                "自分持分の CRUD",
                "×",
                "×",
              ],
              [
                <Badge tone="terra">manager</Badge>,
                "全件",
                "全エンティティの CRUD、契約の CUD",
                "×",
                "○",
              ],
              [
                <Badge tone="soleil">admin</Badge>,
                "全件",
                "全操作（マスタ CRUD・論理削除・復元）",
                "○",
                "○",
              ],
            ]}
          />
          <Callout tone="info">
            権限外の操作はボタン自体が表示されず、Server Action
            側でも拒否されるため、不正操作は発生しない。
          </Callout>
        </Card>

        {/* --- 3. 画面構成 --- */}
        <Card id="section-3">
          <SectionHeader
            number="03"
            icon={LayoutGrid}
            title="画面全体の構成"
            caption="Navigation"
          />
          <SubHeading>サイドバー（左固定メニュー）</SubHeading>
          <Paragraph>
            サイドバーは以下 5
            グループで構成される。折りたたみボタンで幅を縮小可能。
          </Paragraph>
          <Table
            headers={["グループ", "メニュー", "パス", "対象ロール"]}
            rows={[
              ["ダッシュボード", "ダッシュボード", <Code>/dashboard</Code>, "全員"],
              ["マーケティング", "リード", <Code>/leads</Code>, "全員"],
              ["", "キャンペーン", <Code>/campaigns</Code>, "全員"],
              ["営業", "ディール", <Code>/deals</Code>, "全員"],
              ["", "プロジェクト", <Code>/projects</Code>, "全員"],
              ["", "契約", <Code>/contracts</Code>, "manager / admin"],
              ["顧客情報", "連絡先", <Code>/contacts</Code>, "全員"],
              ["", "事業者情報", <Code>/companies</Code>, "全員"],
              ["", "取引先", <Code>/accounts</Code>, "全員"],
              ["", "タレント", <Code>/talents</Code>, "全員"],
              ["管理", "マニュアル", <Code>/manual</Code>, "全員"],
              ["", "マスタ・取込", <Code>/admin</Code>, "admin のみ"],
            ]}
          />

          <SubHeading>共通ボタンの意味</SubHeading>
          <Table
            headers={["ボタン", "意味", "色"]}
            rows={[
              [
                "新規作成（+ 新規登録）",
                "新規作成ページへ遷移",
                <Badge tone="soleil">soleil</Badge>,
              ],
              [
                "保存",
                "編集内容を確定",
                <Badge tone="terra">terra</Badge>,
              ],
              ["キャンセル", "編集を破棄して詳細へ戻る", "透明 + terra 文字"],
              [
                "削除",
                "編集ページ内モーダルで論理削除",
                <Badge tone="error">error</Badge>,
              ],
              ["外部リンク（↗）", "他画面への遷移にはアイコン必須", "—"],
            ]}
          />
        </Card>

        {/* --- 4. ダッシュボード --- */}
        <Card id="section-4">
          <SectionHeader
            number="04"
            icon={Gauge}
            title="ダッシュボード"
            caption="Dashboard"
          />
          <SubHeading>何が見られるか</SubHeading>
          <Paragraph>
            <Code>/dashboard</Code> には 6 つの KPI カードと 4
            つの可視化ブロックが並ぶ。
          </Paragraph>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
            <div
              className="p-4"
              style={{
                backgroundColor: "var(--color-sumi50)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <p
                className="text-xs font-bold uppercase mb-2"
                style={{
                  color: "var(--color-soleil)",
                  letterSpacing: "0.1em",
                }}
              >
                KPI カード（上段）
              </p>
              <UList
                items={[
                  "進行中ディール件数（closed_at IS NULL）",
                  "進行中ディール合計金額（JPY）",
                  "今月クローズ件数",
                  "取引先数（アクティブのみ）",
                  "連絡先数（アクティブのみ）",
                  "事業者情報数（アクティブのみ）",
                ]}
              />
            </div>
            <div
              className="p-4"
              style={{
                backgroundColor: "var(--color-sumi50)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <p
                className="text-xs font-bold uppercase mb-2"
                style={{
                  color: "var(--color-soleil)",
                  letterSpacing: "0.1em",
                }}
              >
                可視化ブロック（下段）
              </p>
              <UList
                items={[
                  "パイプラインファネル（ステージ別の進行中件数）",
                  "最近のディール（上位5件）",
                  "最近のアクティビティ（deal_activities 最新5件）",
                  "担当者別ディール数（進行中のみ）",
                ]}
              />
            </div>
          </div>

          <SubHeading>作業フロー</SubHeading>
          <Steps
            items={[
              "朝一でダッシュボードを開く。",
              "パイプラインファネルで自分のディール分布を把握。",
              "最近のアクティビティで他メンバーの最新活動を確認。",
              "気になるディールがあればサイドバー「ディール」へ移動し詳細へ遷移。",
            ]}
          />
        </Card>

        {/* --- 5. マーケティング --- */}
        <Card id="section-5">
          <SectionHeader
            number="05"
            icon={Megaphone}
            title="マーケティング（リード・キャンペーン）"
            caption="Marketing Automation"
          />

          <SubHeading>5.1 リード（/leads）</SubHeading>
          <Paragraph>
            見込み客情報を社名やフルネーム単位で管理。リード段階では Company
            や Contact を直接作らない。
          </Paragraph>
          <UList
            items={[
              "ステージ × ステータス × 温度感 × デマンドファネル × 担当者で絞り込み",
              "スコアによる並べ替え",
              <>
                <strong>Opportunity ステージへの遷移で、Company / Contact / Account / Deal を自動生成</strong>（Deal 昇格）
              </>,
            ]}
          />

          <SubHeading>作業フロー: リード新規登録</SubHeading>
          <Steps
            items={[
              <>
                <Code>/leads</Code> で <Badge tone="soleil">+ 新規登録</Badge>{" "}
                をクリック → <Code>/leads/new</Code> へ遷移。
              </>,
              "氏名（★必須） / リードソース（★必須） / 担当者（★必須、初期値は自分）を入力。",
              "社名、事業者情報、連絡先、メール、電話、URL、ステージ、ステータス、温度感、メモを任意で入力（デマンドファネルはステージと流入元から自動で決まる）。",
              "「保存」で一覧に戻り、新しいレコードが表示される。",
            ]}
          />

          <SubHeading>作業フロー: リード育成（ステージ遷移）</SubHeading>
          <Steps
            items={[
              <>
                一覧からリード名をクリック → <Code>/leads/[id]</Code> 詳細画面。
              </>,
              <>
                右上「編集」→ <Code>/leads/[id]/edit</Code> へ遷移。
              </>,
              "ステージ／ステータス／温度感を更新して保存。",
              <>
                保存ごとに <Code>lead_activities</Code>{" "}
                に「ステージ変更」の履歴が記録される。
              </>,
            ]}
          />

          <SubHeading>作業フロー: Deal 昇格（最重要）</SubHeading>
          <Callout tone="warning" title="リード段階では既存エンティティと紐付けない">
            Lead 段階で Company や Contact
            と紐付けるフィールドは存在しない。Opportunity 遷移時に
            <strong>システム側で一括新規作成</strong>される。
          </Callout>
          <div
            className="p-4 my-4 font-mono text-xs leading-6"
            style={{
              backgroundColor: "var(--color-sumi900)",
              color: "var(--color-amber)",
              borderRadius: "var(--radius-md)",
              overflowX: "auto",
            }}
          >
            <div>Lead（Opportunity 遷移を保存）</div>
            <div> └─ Step 1: Company 作成（社名がある場合）</div>
            <div> └─ Step 2: Contact 作成（employee or individual）</div>
            <div> └─ Step 2b: 電話があれば contact_phones に INSERT</div>
            <div> └─ Step 3: Account 作成（法人 or 個人）</div>
            <div> └─ Step 4: account_contacts で Contact を紐付け</div>
            <div> └─ Step 5: Deal 作成（Account 紐付き）</div>
            <div> └─ Step 6: leads の promoted_* を一括更新</div>
          </div>
          <Steps
            items={[
              "リード編集ページを開く。",
              <>
                ステージを Opportunity（<Code>opportunity</Code>）に変更。
              </>,
              <>
                必須項目を確認: <Code>lead_name</Code> と{" "}
                <Code>account_type_id</Code> が未入力ならエラー。
              </>,
              <>
                「保存」→ Server Action <Code>promoteLeadToDeal</Code>{" "}
                が実行される。
              </>,
              <>
                成功時 <Code>promoted_deal_id</Code>{" "}
                がセットされ、再昇格は不可（二重生成防止）。
              </>,
              "失敗時は途中まで作成されたエンティティが自動ロールバック。",
            ]}
          />

          <SubHeading>5.2 キャンペーン（/campaigns）</SubHeading>
          <Paragraph>
            メルマガ・イベント・広告などキャンペーン単位でリードをグルーピング。
            N:M 関係を管理する。
          </Paragraph>
          <Callout tone="info" title="シナリオ機能は未実装">
            ステップメールなどのシナリオ機能は、Lead / Campaign
            土台完成後に別途協議する。現時点は土台のみ提供。
          </Callout>
          <Steps
            items={[
              <>
                <Code>/campaigns</Code> → <Badge tone="soleil">+ 新規登録</Badge>。
              </>,
              "キャンペーン名・開始日／終了日・ソース・説明を入力。",
              "保存 → 詳細画面で「リードを紐付け」から既存リードを複数選択。",
            ]}
          />
        </Card>

        {/* --- 6. 営業 --- */}
        <Card id="section-6">
          <SectionHeader
            number="06"
            icon={Handshake}
            title="営業（ディール・プロジェクト・契約）"
            caption="Sales Force Automation"
          />

          <SubHeading>6.1 ディール（/deals）</SubHeading>
          <UList
            items={[
              "カンバン / テーブルビューの切替（右上アイコン）",
              "カンバンはステージ別 or ステータス別にグルーピング可能",
              "パイプライン種別で表示を切替",
              "ドラッグ & ドロップでステージ変更",
              "検索・フィルタ",
            ]}
          />

          <SubHeading>作業フロー: ディール直接登録</SubHeading>
          <Paragraph>
            既存 Account
            に対して新規ディールを直接登録する経路（リード昇格以外の経路）。
          </Paragraph>
          <Steps
            items={[
              <>
                <Code>/deals</Code> → <Badge tone="soleil">+ 新規登録</Badge> → <Code>/deals/new</Code>。
              </>,
              "ディール名（★）/ 取引先（★）/ パイプライン種別（★）/ ステージ（★）を選択。",
              "ステータス、金額、クローズ予定日、社内担当者、メモを任意で入力。",
              <>
                保存。<Code>deal_code</Code> が自動発番される。
              </>,
            ]}
          />

          <SubHeading>作業フロー: カンバンでのステージ遷移</SubHeading>
          <Steps
            items={[
              "対象カードを掴んで別列へドラッグ。ドロップ先がハイライト（soleil）される。",
              <>
                ドロップと同時に <Code>deal_stage_id</Code>{" "}
                が更新され、<Code>deal_stage_histories</Code>{" "}
                に履歴が記録される。
              </>,
              "失敗時は元の位置に戻り、エラートーストが表示される。",
            ]}
          />

          <Callout tone="warning" title="ディールの削除 UI は存在しない">
            <Code>deals</Code> テーブルは現状 <Code>is_active</Code>{" "}
            カラム未導入のため、UI
            から削除操作は提供されない。取り消したい場合はクローズ（失注）ステージへ遷移させる。
          </Callout>

          <SubHeading>6.2 プロジェクト（/projects）</SubHeading>
          <Paragraph>
            複数ディールを「目的」単位でグルーピング（例:
            万博プロジェクト）。パイプラインと直交する軸で、1
            ディールが複数プロジェクトに属することも可能。
          </Paragraph>
          <Steps
            items={[
              <>
                <Code>/projects</Code> → <Badge tone="soleil">+ 新規登録</Badge>。
              </>,
              "プロジェクト名・ステータス・責任者（1名）・開始日・終了予定日・説明を入力。",
              "保存後、詳細画面から「ディールを追加」「メンバーを追加」で関連付け。",
            ]}
          />
          <Callout tone="info">
            プロジェクトと取引先は直接リレーションを持たない。必ずディール経由で関連する。
          </Callout>

          <SubHeading>6.3 契約（/contracts）</SubHeading>
          <Paragraph>
            ディールに紐づく契約情報（紙面／電子／口頭）を管理。
            <Badge tone="warning">manager / admin のみ</Badge>アクセス可能。
          </Paragraph>
          <Steps
            items={[
              <>
                <Code>/contracts</Code> → <Badge tone="soleil">+ 新規登録</Badge>。
              </>,
              "契約対象ディール・契約種別・契約方式（paper/electronic/verbal）を入力。",
              "契約日・開始日・終了日・金額・メモを入力し保存。",
            ]}
          />
        </Card>

        {/* --- 7. 顧客情報 --- */}
        <Card id="section-7">
          <SectionHeader
            number="07"
            icon={Users}
            title="顧客情報（連絡先・事業者情報・取引先・タレント）"
            caption="Core CRM"
          />

          <SubHeading>エンティティ間の関係</SubHeading>
          <div
            className="p-4 my-4 font-mono text-xs leading-6"
            style={{
              backgroundColor: "var(--color-sumi900)",
              color: "var(--color-sage)",
              borderRadius: "var(--radius-md)",
              overflowX: "auto",
            }}
          >
            <div>事業者情報（法的実体）─ 1:N ─ 取引先（法人）</div>
            <div>              ↘        ↑ account_contacts (N:M)</div>
            <div>事業者情報 ─ 1:N ─ 連絡先（corporate_rep/employee）</div>
            <div>                                        ↓</div>
            <div>                                   タレント（1:1）</div>
          </div>
          <UList
            items={[
              <>
                <Code>contact_type</Code> = <strong>corporate_rep / employee</strong>{" "}
                → 事業者情報に直接紐付く
              </>,
              <>
                <Code>contact_type</Code> = <strong>individual</strong> →{" "}
                <Code>account_contacts</Code> を介して取引先に紐付く
              </>,
              "ディールは必ず取引先に紐付く（直接連絡先／事業者情報とは紐付かない）",
            ]}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div
              className="p-5"
              style={{
                backgroundColor: "var(--color-sumi50)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Building2 size={18} style={{ color: "var(--color-terra)" }} />
                <h3
                  className="text-base font-bold"
                  style={{ color: "var(--color-text-title)" }}
                >
                  事業者情報
                </h3>
              </div>
              <Paragraph>
                組織の法的実体。法人番号・インボイス登録番号・代表者名などを管理。
              </Paragraph>
              <UList
                items={[
                  "社名／法人格／法人番号／インボイス登録番号",
                  "取引先担当者（primary_contact_id）",
                  "代表者名（文字列、連絡先とは紐付けない）",
                  "詳細から + 取引先 / + 法人連絡先 を作成できる",
                ]}
              />
            </div>

            <div
              className="p-5"
              style={{
                backgroundColor: "var(--color-sumi50)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Briefcase
                  size={18}
                  style={{ color: "var(--color-terra)" }}
                />
                <h3
                  className="text-base font-bold"
                  style={{ color: "var(--color-text-title)" }}
                >
                  取引先
                </h3>
              </div>
              <Paragraph>
                取引主体。<strong>法人</strong>（事業者情報紐付き）と
                <strong>個人</strong>（連絡先直接）の 2 パターン。
              </Paragraph>
              <UList
                items={[
                  "法人: 事業者情報を既存から選択",
                  "個人: individual 連絡先を紐付け",
                  "ディールは必ず取引先経由",
                ]}
              />
            </div>

            <div
              className="p-5"
              style={{
                backgroundColor: "var(--color-sumi50)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Users size={18} style={{ color: "var(--color-terra)" }} />
                <h3
                  className="text-base font-bold"
                  style={{ color: "var(--color-text-title)" }}
                >
                  連絡先
                </h3>
              </div>
              <Paragraph>
                個人。<Code>contact_type</Code> で紐付け先が決まる。
              </Paragraph>
              <UList
                items={[
                  "corporate_rep: 法人代表（事業者情報直接）",
                  "employee: 法人従業員（事業者情報直接）",
                  "individual: 個人（取引先経由）",
                ]}
              />
            </div>

            <div
              className="p-5"
              style={{
                backgroundColor: "var(--color-sumi50)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <UserCircle
                  size={18}
                  style={{ color: "var(--color-terra)" }}
                />
                <h3
                  className="text-base font-bold"
                  style={{ color: "var(--color-text-title)" }}
                >
                  タレント
                </h3>
              </div>
              <Paragraph>
                連絡先と 1:1
                で紐付く人材特性情報。スキル・経歴・ポテンシャル診断。
              </Paragraph>
              <UList
                items={[
                  <>
                    生年月日保存時に <Code>potential_number</Code>（1〜60）と{" "}
                    <Code>constellation</Code>（12 星座）を自動算出
                  </>,
                  <>
                    マスタ未投入時はエラー（<Code>reference_diagnosis.md</Code> 準拠）
                  </>,
                ]}
              />
            </div>
          </div>
        </Card>

        {/* --- 8. マスタ・取込 --- */}
        <Card id="section-8">
          <SectionHeader
            number="08"
            icon={Settings}
            title="マスタ・取込（マスタ管理）"
            caption="Admin"
          />
          <Paragraph>
            <Code>/admin</Code> は <Badge tone="soleil">admin 専用</Badge>。
            タブで 19 種のマスタを切り替え、それぞれ作成／編集／論理削除が可能。
          </Paragraph>

          <SubHeading>タブ構成</SubHeading>
          <Table
            headers={["グループ", "タブ", "用途"]}
            rows={[
              [
                "共通・取引",
                "パイプライン",
                "pipeline_types / deal_stages / deal_statuses（階層）",
              ],
              ["", "契約種別", "contract_types"],
              ["", "サービス", "services"],
              ["事業者情報", "法人格", "corporate_types"],
              ["", "事業者情報ステータス", "company_statuses"],
              ["取引先", "取引先種別", "account_types（法人/個人）"],
              ["", "取引先ステータス", "account_statuses"],
              ["連絡先", "連絡先ステータス", "contact_statuses"],
              ["リード・マーケティング", "リードソース", "lead_sources"],
              ["", "デマンドファネル", "lead_categories"],
              [
                "",
                "ステージ・ステータス",
                "lead_stages / lead_statuses（階層）",
              ],
              ["", "温度感", "lead_temperatures"],
              ["", "コールステータス", "lead_call_statuses"],
              [
                "",
                "セグメント",
                "lead_large_segments / lead_small_segments（階層）",
              ],
              ["", "対応種別", "lead_activity_types"],
              ["プロジェクト", "プロジェクトステータス", "project_statuses"],
              ["タレント", "スキル", "skill_categories / skills（階層）"],
            ]}
          />

          <SubHeading>作業フロー: マスタ追加／編集／削除</SubHeading>
          <Steps
            items={[
              <>
                <Code>/admin</Code> → 対象タブを選択。
              </>,
              <>
                <Badge tone="soleil">+ 新規追加</Badge> →
                名前・コード・ソート順・色スワッチ等を入力 → 保存。
              </>,
              "行の「編集」から項目を変更して保存。",
              <>
                「削除」は論理削除（<Code>deleted_at</Code>{" "}
                に現在時刻）。参照中のトランザクションデータは残る。
              </>,
              <>
                誤削除は <Code>/admin/deleted</Code> から復元可能（admin のみ）。
              </>,
            ]}
          />

          <Callout tone="error" title="コードは変更しない">
            <Code>code</Code> / <Code>slug</Code> は Server Action
            内で分岐に使われる場合がある。名前は変更可だが、コードは固定。
          </Callout>
        </Card>

        {/* --- 9. 編集・削除 --- */}
        <Card id="section-9">
          <SectionHeader
            number="09"
            icon={Pencil}
            title="編集・削除の共通ルール"
            caption="Edit & Delete"
          />
          <SubHeading>詳細 → 編集 → 保存の統一フロー</SubHeading>
          <UList
            items={[
              <>
                詳細ページ（<Code>/xxx/[id]</Code>）は
                <strong>閲覧専用</strong>。インライン編集は行わない。
              </>,
              <>
                右上「編集」ボタン → 編集ページ（<Code>/xxx/[id]/edit</Code>）
              </>,
              "編集ページで「保存」「キャンセル」「削除」を行う",
              "保存後は詳細ページへ戻る",
            ]}
          />

          <SubHeading>削除（論理削除）</SubHeading>
          <UList
            items={[
              "削除ボタンは編集ページ内に配置。独立した「危険ゾーン」セクションは置かない",
              "クリック時は確認モーダルが表示される",
              <>
                実行すると <Code>deleted_at</Code>{" "}
                に現在時刻をセット。一覧から即座に消える
              </>,
              "関連する履歴・子レコードは保持される",
            ]}
          />

          <Callout tone="error" title="物理削除は提供しない">
            DB から行を消す操作は仕様上存在しない（監査証跡確保のため）。
            <Code>deals</Code> は現状 <Code>is_active</Code>{" "}
            列が未導入のため削除 UI 自体なし。不要な deal
            はクローズ（失注）で対応。
          </Callout>
        </Card>

        {/* --- 10. アクセス制御 --- */}
        <Card id="section-10">
          <SectionHeader
            number="10"
            icon={ShieldCheck}
            title="アクセス制御と見え方"
            caption="Security"
          />
          <SubHeading>多層防御</SubHeading>
          <Paragraph>
            全ての書き込み操作は 3
            層で保護されている。ユーザーはこれを意識する必要はない。
          </Paragraph>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-4">
            {[
              {
                no: "01",
                title: "Middleware",
                desc: "未認証は /login へ強制リダイレクト",
              },
              {
                no: "02",
                title: "Server Action",
                desc: "認証 + ロール + オーナーチェック",
              },
              {
                no: "03",
                title: "RLS",
                desc: "Supabase 行単位アクセス制御",
              },
            ].map((l) => (
              <div
                key={l.no}
                className="p-4"
                style={{
                  backgroundColor: "var(--color-sumi50)",
                  borderRadius: "var(--radius-md)",
                  borderTop: "3px solid var(--color-soleil)",
                }}
              >
                <p
                  className="text-xs font-mono mb-1"
                  style={{ color: "var(--color-sumi500)" }}
                >
                  Layer {l.no}
                </p>
                <h4
                  className="text-sm font-bold mb-1"
                  style={{ color: "var(--color-text-title)" }}
                >
                  {l.title}
                </h4>
                <p
                  className="text-xs leading-5"
                  style={{ color: "var(--color-sumi700)" }}
                >
                  {l.desc}
                </p>
              </div>
            ))}
          </div>

          <SubHeading>ロール別の見え方</SubHeading>
          <Table
            headers={["観点", "member", "manager / admin"]}
            rows={[
              [
                "一覧表示",
                "owner_user_id = 自分のみ",
                "全件表示（フィルタで絞り込み可）",
              ],
              [
                "詳細 URL 直打ち",
                "他人のデータは「見つかりません」",
                "全件閲覧可",
              ],
              ["ダッシュボード集計", "自分持ち分のみ", "全件集計"],
              ["契約メニュー", "非表示", "表示"],
              ["admin メニュー", "非表示", "admin のみ表示"],
            ]}
          />
        </Card>

        {/* --- 11. トラブル --- */}
        <Card id="section-11">
          <SectionHeader
            number="11"
            icon={LifeBuoy}
            title="よくあるトラブルと対処"
            caption="FAQ"
          />
          <Table
            headers={["症状", "原因", "対処"]}
            rows={[
              [
                "「Opportunity 昇格には lead_name と account_type_id が必要」エラー",
                "昇格条件未充足",
                <>
                  <Code>lead_name</Code> と <Code>account_type_id</Code>{" "}
                  を埋めて保存
                </>,
              ],
              [
                "「このリードはすでに Deal に昇格済みです」",
                "二重昇格防止の想定挙動",
                "既に生成された Deal を編集する。リード側は参照専用",
              ],
              [
                "ディール一覧に削除ボタンがない",
                <>
                  仕様どおり（<Code>is_active</Code> 未導入）
                </>,
                "失注ステージへの遷移で「取り消し」を表現",
              ],
              [
                "他メンバーのディールが見えない",
                "member 権限のため",
                "manager へロール変更を依頼",
              ],
              [
                "/admin にアクセスしても 404",
                "admin 以外は URL アクセス拒否",
                "admin への昇格を依頼",
              ],
              [
                "タレント保存時「ポテンシャル診断マスタが見つかりません」",
                "number_diagnosis / constellation_fortune_telling 未投入",
                "admin に連絡してマスタ投入を依頼",
              ],
              [
                "カンバンでドラッグしてもステージが戻る",
                "ネットワークエラー or 権限不足",
                "ブラウザコンソール確認。解決しない場合は管理者へ",
              ],
              [
                "検索結果が出ない",
                "フィルタが残存",
                "「フィルタをクリア」ボタンで全解除",
              ],
            ]}
          />
        </Card>

        {/* --- 12. 外部連携 --- */}
        <Card id="section-12">
          <SectionHeader
            number="12"
            icon={Link2}
            title="外部連携（Gmail・Google コンタクト・freee 会計）"
            caption="External Integrations"
          />
          <Paragraph>
            どの連携も「接続」してから「同期」を行う。接続先のデータを勝手に書き換えることはなく、
            <strong>CRM が正</strong>として扱う（freee 会計だけは項目ごとにどちらを正にするか選べる）。
          </Paragraph>

          <SubHeading>12.1 Gmail 連携（プロフィール）</SubHeading>
          <Paragraph>
            連携すると、そのアカウントの送受信が連絡先の
            <strong>アクティビティ</strong>として並ぶ。取り込むのは件名・相手・日時だけで、
            本文と添付は CRM に保存しない（中身は Gmail 側で開く）。
          </Paragraph>
          <Steps
            items={[
              <>
                <Code>/profile</Code> を開く（ヘッダーのユーザーメニューから遷移）。
              </>,
              <>
                「Gmail 連携」カードの{" "}
                <Badge tone="terra">アカウントを連携</Badge>{" "}
                → Google のログイン画面で許可する。
              </>,
              "接続すると一覧に表示される。「同期」で取り込みを開始する。",
              "連絡先詳細の「アクティビティ」に、件名・日時・送受信の向きが並ぶ。クリックすると Gmail が別タブで開く。",
              "「解除」で連携を止める。取り込み済みのやり取りは履歴として残る。",
            ]}
          />
          <Callout tone="warning" title="未設定の環境では接続できない">
            環境変数（<Code>GOOGLE_OAUTH_CLIENT_ID</Code> /{" "}
            <Code>GOOGLE_OAUTH_CLIENT_SECRET</Code> /{" "}
            <Code>GMAIL_TOKEN_ENCRYPTION_KEY</Code>）が未設定の環境では
            「Gmail 連携が未設定です」と表示され、接続ボタンは出ない。
          </Callout>

          <SubHeading>12.2 Google コンタクト連携（プロフィール）</SubHeading>
          <Paragraph>
            CRM の連絡先を Google コンタクトの<strong>「ITERRA CRM」グループ</strong>
            へ同期する。スマホの電話帳や Gmail の宛先補完に相手の名前が出るようになる。
            <strong>触るのはこのグループの中だけ</strong>で、個人の連絡先には手を付けない。
            社内メモ・診断結果・ステータスは同期しない。
          </Paragraph>
          <Steps
            items={[
              <>
                <Code>/profile</Code> の「Google コンタクト連携」カードで{" "}
                <Badge tone="terra">Google と連携する</Badge>。
              </>,
              <>
                連携時に Google から「連絡先の表示、編集、ダウンロード、完全な削除」の許可を求められる。
                Google の連絡先スコープは 1 段階しかなく、書き込むにはこれを許可する必要がある。
                実際に作成・更新・削除するのは「ITERRA CRM」グループに入れた連絡先だけ。
              </>,
              <>
                「同期」で登録・更新・削除を反映する。件数が多い場合は 1 回の上限で打ち切られ、
                「もう一度同期を押すと続きから進みます」と案内される。
              </>,
              "「解除」で同期を止める。Google 側の連絡先は残る（消したい場合は Google の画面で「ITERRA CRM」グループごと削除する）。",
            ]}
          />
          <Callout tone="info">
            会社の Google アカウントで連携する。環境変数（
            <Code>GOOGLE_CONTACTS_CLIENT_ID</Code> /{" "}
            <Code>GOOGLE_CONTACTS_CLIENT_SECRET</Code> /{" "}
            <Code>GOOGLE_CONTACTS_TOKEN_ENCRYPTION_KEY</Code>）が未設定の環境では接続ボタンは出ない。
          </Callout>

          <SubHeading>12.3 freee 会計連携（/admin/freee・admin 専用）</SubHeading>
          <Paragraph>
            freee 会計にある取引先を CRM へ取り込み、事業者情報と突き合わせる。
            <strong>freee 側のデータは自動で書き換えない</strong>（読み取りのみ）。
            書き換えるのは差分画面で人が確定した項目だけ。
          </Paragraph>

          <SubHeading>作業フロー: 接続と同期</SubHeading>
          <Steps
            items={[
              <>
                <Code>/admin/freee</Code>{" "}
                を開く（サイドバー「マスタ・取込」→「freee 連携」）。
              </>,
              <>
                「freee と接続する」→ freee のログイン画面で事業所へのアクセスを許可する。
              </>,
              "接続後は事業所名・接続日時・最終同期日時・最終の全件同期日時が表示される。",
            ]}
          />
          <Table
            headers={["ボタン", "内容"]}
            rows={[
              ["今すぐ同期", "前回同期日以降に更新された取引先だけを取り込む（差分）"],
              [
                "全件同期（削除も検出）",
                "全件を取り直す。freee 側で削除された取引先が分かるのはこれだけ",
              ],
              ["接続を解除", "以後の同期を止める。取り込み済みのデータと紐付けは残る"],
            ]}
          />
          <Paragraph>
            本番では日次（差分）・週次（全件）で自動実行される。手動同期は確認や急ぎのとき用。
            環境変数（<Code>FREEE_CLIENT_ID</Code> / <Code>FREEE_CLIENT_SECRET</Code> /{" "}
            <Code>FREEE_TOKEN_ENCRYPTION_KEY</Code>）が未設定の環境では「未設定です」と出て接続ボタンは表示されない。
          </Paragraph>

          <SubHeading>作業フロー: 突合（/admin/freee/partners）</SubHeading>
          <Paragraph>
            <strong>インボイス登録番号が一致した取引先は自動で紐付く。</strong>
            それ以外は「未紐付け」で並ぶので、行を開いて候補を見ながら次のいずれかを選ぶ。
          </Paragraph>
          <Table
            headers={["操作", "いつ使うか"]}
            rows={[
              [
                "候補の「これに紐付ける」",
                "CRM に同じ相手が既にいる。候補は名称・メールドメイン・電話の一致から出る",
              ],
              ["「事業者情報として登録」", "CRM にまだいない。事業者情報を新しく作って紐付ける"],
              ["「対象外にする」", "CRM に持つ必要が無い相手（税務署・銀行など）"],
            ]}
          />
          <Callout tone="warning" title="取引先（Account）はここでは作られない">
            取引先は契約が成立したときにだけ作られる仕組みのため、ここで作るのは事業者情報まで。
          </Callout>

          <SubHeading>
            作業フロー: 連携する事業者を追加する（/admin/freee/register）
          </SubHeading>
          <Paragraph>
            CRM にあって freee に無い事業者情報を、freee 側へ新しく登録する画面。
            一覧を開いて行を展開すると freee 側の似た取引先が候補として出るので、
            <strong>既にあるなら新規登録ではなく紐付けを選ぶ</strong>
            （freee は取引先名の重複を許すため、確認せずに作ると表記ゆれで同じ相手が 2
            つできる）。
          </Paragraph>
          <UList
            items={[
              "候補が無ければ「freee に登録する」で新規登録する",
              "登録すると取引先コードに CRM の事業者コード（例: CMP-…）が入り、以後はこのコードで自動的に突合される",
              "取引先コードは登録のときにしか入れられない。作り直しでは直せないため、似た取引先が無いか必ず確認してから登録する",
            ]}
          />

          <SubHeading>作業フロー: 差分の確認と反映（/admin/freee/sync）</SubHeading>
          <Paragraph>
            取り込んだ freee の値と CRM の値を項目ごとに見比べ、どちらを正として反映するか選ぶ画面。
            <strong>既定はすべて「CRM → freee」</strong>。会計側の修正を採りたい項目だけ
            「freee → CRM」に切り替える。反映しない項目は「触らない」のままにしておく。
          </Paragraph>
          <UList
            items={[
              <>
                <strong>担当者名</strong>は freee
                側の値をそのまま取り込めない（氏名の切れ目が分からず、同名の別人に紐づく恐れがあるため）。
                「この名前の連絡先を探す」で候補を出し、人が選んで紐づける
              </>,
              <>
                <strong>担当者メール</strong>は、同じ人が 2
                社の担当者で会社ごとに使い分けている場合に備え、行の「連携に使うメール」欄からその場で選べる（連携プロファイルへ直接保存される）
              </>,
              <>
                <strong>取引先コード</strong>はどちらへも反映できない。freee
                の更新 API がコードを受け付けず（登録時のみ）、事業者コードは CRM
                が採番するため。揃えたい場合は freee の画面で直接入力する
              </>,
              <>
                どちらの向きにも直せない項目は
                <strong>「この項目は突き合わせない」</strong>
                で対象外にできる。対象外は差分一覧から消えるため、
                <strong>戻す入口は画面上部の「突き合わせ対象外にした項目」に置かれている</strong>。値そのものは変えない
              </>,
            ]}
          />
          <Callout tone="warning" title="freee は会計のデータ">
            「CRM → freee」を選んだ項目は freee 側が書き換わる。反映は 1
            相手ずつ、「この相手の差分を反映」で確定する。
          </Callout>

          <SubHeading>連携プロファイル（事業者情報の詳細・admin 限定）</SubHeading>
          <Paragraph>
            freee へ渡す値をどのレコードから取るかを、事業者情報ごとに選べる設定。
            <strong>値そのものではなく、レコードを選ぶ</strong>ため、CRM 側の情報を直せば連携値も追随する。
            対象は<strong>担当者・担当者メール・電話・住所・口座</strong>の 5 項目。
          </Paragraph>
          <UList
            items={[
              "未選択は「既定に従う」（主担当・主メール・主住所・主口座・代表電話）",
              "担当者を選び直すとメールの選択は外れる（別人のメールを送らないため）。担当者の候補はその事業者に関わる連絡先（所属または兼務）だけ",
              "同じ人が 2 社の担当者で、会社ごとにメールを使い分けている場合に必要になる（主メールは連絡先に 1 つしか立たないため）",
            ]}
          />
        </Card>
      </div>

      {/* ===== フッター ===== */}
      <div
        className="mt-8 p-6 text-center"
        style={{
          backgroundColor: "var(--color-sumi50)",
          borderRadius: "var(--radius-card)",
        }}
      >
        <p
          className="text-xs"
          style={{ color: "var(--color-sumi600)" }}
        >
          ITERRA CRM · 運用マニュアル · 最終更新 2026-08-09
        </p>
        <p
          className="text-xs mt-1"
          style={{ color: "var(--color-sumi500)" }}
        >
          用語定義は <Code>docs/glossary.md</Code> / DB 設計は{" "}
          <Code>docs/database-design.md</Code> を参照
        </p>
      </div>
    </div>
  );
}
