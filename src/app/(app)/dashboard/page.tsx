import {
  TrendingUp,
  DollarSign,
  Target,
  Users,
  Contact,
  Building2,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ActivityTypeBadge } from "@/components/ui/badges";
import { EntityLink } from "@/components/ui/EntityLink";
import { activityEntityHref, formatOccurredAt } from "@/lib/activity";

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
}) {
  return (
    <div
      className="p-5 transition-shadow"
      style={{
        backgroundColor: "#fff",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--elevation-low)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-xs font-semibold tracking-wide"
          style={{ color: "var(--color-sumi600)" }}
        >
          {label}
        </span>
        <Icon size={18} style={{ color: "var(--color-sumi400)" }} />
      </div>
      <p
        className="text-2xl font-bold"
        style={{ color: "var(--color-text-title)" }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-xs mt-1" style={{ color: "var(--color-sumi600)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

const jpyCurrency = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
});

export default async function DashboardPage() {
  const supabase = await createClient();

  // ---------- KPI データ取得 ----------
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const [
    activeDealsRes,
    activeDealsSumRes,
    closedThisMonthRes,
    activeAccountsRes,
    activeContactsRes,
    activeCompaniesRes,
  ] = await Promise.all([
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .is("closed_at", null),
    supabase
      .from("deals")
      .select("amount")
      .is("closed_at", null),
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .gte("closed_at", monthStart)
      .lte("closed_at", monthEnd),
    supabase
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
  ]);

  const activeDealsCount = activeDealsRes.count ?? 0;
  const activeDealsSum =
    activeDealsSumRes.data?.reduce((s, d) => s + (d.amount ?? 0), 0) ?? 0;
  const closedThisMonthCount = closedThisMonthRes.count ?? 0;
  const activeAccountsCount = activeAccountsRes.count ?? 0;
  const activeContactsCount = activeContactsRes.count ?? 0;
  const activeCompaniesCount = activeCompaniesRes.count ?? 0;

  const hasKpiError =
    activeDealsRes.error ||
    activeDealsSumRes.error ||
    closedThisMonthRes.error ||
    activeAccountsRes.error ||
    activeContactsRes.error ||
    activeCompaniesRes.error;

  // ---------- パイプラインファネル ----------
  const { data: stages, error: stagesError } = await supabase
    .from("deal_stages")
    .select("id, name, sort_order")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  let funnelData: { name: string; count: number }[] = [];
  if (stages && stages.length > 0) {
    const { data: funnelDeals } = await supabase
      .from("deals")
      .select("deal_stage_id")
      .is("closed_at", null);

    const countMap = new Map<string, number>();
    for (const d of funnelDeals ?? []) {
      countMap.set(d.deal_stage_id, (countMap.get(d.deal_stage_id) ?? 0) + 1);
    }
    funnelData = stages.map((s) => ({
      name: s.name,
      count: countMap.get(s.id) ?? 0,
    }));
  }
  const maxFunnelCount = Math.max(...funnelData.map((f) => f.count), 1);

  // ---------- 最近のディール ----------
  const { data: recentDeals, error: recentDealsError } = await supabase
    .from("deals")
    .select(
      `
      id, deal_code, name, amount,
      deal_stage:deal_stages(name),
      owner:crm_users!deals_owner_user_id_fkey(full_name)
    `
    )
    .order("created_at", { ascending: false })
    .limit(5);

  // ---------- 最近のアクティビティ ----------
  // 社内対応・顧客行動・メールを横断する activity_feed から最新 5 件。
  // ビューは security_invoker なので、見える範囲は各自が担当する分に限られる
  const { data: recentActivities, error: recentActivitiesError } = await supabase
    .from("activity_feed")
    .select(
      "id, source_kind, occurred_at, has_time, activity_name, activity_color, entity_type, entity_id, entity_label, actor_name"
    )
    .order("occurred_at", { ascending: false })
    .limit(5);

  // ---------- 担当者別ディール数 ----------
  const { data: ownerDeals, error: ownerDealsError } = await supabase
    .from("deals")
    .select(
      `
      owner_user_id,
      owner:crm_users!deals_owner_user_id_fkey(full_name)
    `
    )
    .is("closed_at", null);

  const ownerCountMap = new Map<string, { name: string; count: number }>();
  for (const d of ownerDeals ?? []) {
    const key = d.owner_user_id;
    const ownerObj = d.owner as unknown as { full_name: string } | null;
    if (!key) continue;
    const existing = ownerCountMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      ownerCountMap.set(key, {
        name: ownerObj?.full_name ?? "不明",
        count: 1,
      });
    }
  }
  const ownerStats = Array.from(ownerCountMap.values()).sort(
    (a, b) => b.count - a.count
  );

  return (
    <div>
      <h1
        className="text-2xl font-bold mb-6"
        style={{ color: "var(--color-text-title)" }}
      >
        ダッシュボード
      </h1>

      {/* KPI Cards */}
      {hasKpiError ? (
        <div
          className="p-4 mb-8 text-sm"
          style={{
            backgroundColor: "#fff",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--elevation-low)",
            color: "var(--color-sumi600)",
          }}
        >
          データを取得できませんでした
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
          <KpiCard
            label="進行中商談"
            value={String(activeDealsCount)}
            sub="クローズ前の商談"
            icon={Target}
          />
          <KpiCard
            label="進行中 合計金額"
            value={jpyCurrency.format(activeDealsSum)}
            icon={DollarSign}
          />
          <KpiCard
            label="今月クローズ"
            value={String(closedThisMonthCount)}
            sub={`${now.getFullYear()}年${now.getMonth() + 1}月`}
            icon={TrendingUp}
          />
          <KpiCard
            label="取引先数"
            value={String(activeAccountsCount)}
            sub="アクティブのみ"
            icon={Users}
          />
          <KpiCard
            label="連絡先数"
            value={String(activeContactsCount)}
            sub="アクティブのみ"
            icon={Contact}
          />
          <KpiCard
            label="事業者情報数"
            value={String(activeCompaniesCount)}
            sub="アクティブのみ"
            icon={Building2}
          />
        </div>
      )}

      {/* 下部セクション 2カラムグリッド */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* パイプラインファネル */}
        <div
          className="p-6"
          style={{
            backgroundColor: "#fff",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--elevation-low)",
          }}
        >
          <h2
            className="text-base font-bold mb-4"
            style={{ color: "var(--color-text-title)" }}
          >
            パイプラインファネル
          </h2>
          {stagesError ? (
            <p className="text-sm" style={{ color: "var(--color-sumi600)" }}>
              データを取得できませんでした
            </p>
          ) : funnelData.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-sumi500)" }}>
              ステージが登録されていません
            </p>
          ) : (
            <div className="space-y-3">
              {funnelData.map((item) => (
                <div key={item.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className="text-xs font-medium"
                      style={{ color: "var(--color-sumi600)" }}
                    >
                      {item.name}
                    </span>
                    <span
                      className="text-xs font-bold"
                      style={{ color: "var(--color-text-title)" }}
                    >
                      {item.count}件
                    </span>
                  </div>
                  <div
                    className="h-6 rounded"
                    style={{ backgroundColor: "var(--color-sumi50)" }}
                  >
                    <div
                      className="h-full rounded transition-all"
                      style={{
                        width: `${Math.max(
                          (item.count / maxFunnelCount) * 100,
                          item.count > 0 ? 4 : 0
                        )}%`,
                        backgroundColor: "var(--color-terra)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 最近のディール */}
        <div
          className="p-6"
          style={{
            backgroundColor: "#fff",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--elevation-low)",
          }}
        >
          <h2
            className="text-base font-bold mb-4"
            style={{ color: "var(--color-text-title)" }}
          >
            最近の商談
          </h2>
          {recentDealsError ? (
            <p className="text-sm" style={{ color: "var(--color-sumi600)" }}>
              データを取得できませんでした
            </p>
          ) : !recentDeals || recentDeals.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-sumi500)" }}>
              商談がありません
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "var(--color-sumi50)" }}>
                    <th
                      className="text-left px-3 py-2 font-semibold text-xs"
                      style={{ color: "var(--color-sumi600)" }}
                    >
                      コード
                    </th>
                    <th
                      className="text-left px-3 py-2 font-semibold text-xs"
                      style={{ color: "var(--color-sumi600)" }}
                    >
                      名前
                    </th>
                    <th
                      className="text-left px-3 py-2 font-semibold text-xs"
                      style={{ color: "var(--color-sumi600)" }}
                    >
                      ステージ
                    </th>
                    <th
                      className="text-right px-3 py-2 font-semibold text-xs"
                      style={{ color: "var(--color-sumi600)" }}
                    >
                      金額
                    </th>
                    <th
                      className="text-left px-3 py-2 font-semibold text-xs"
                      style={{ color: "var(--color-sumi600)" }}
                    >
                      担当者
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentDeals.map((deal) => (
                    <tr
                      key={deal.id}
                      style={{
                        borderBottom: "1px solid var(--color-border-default)",
                      }}
                    >
                      <td
                        className="px-3 py-2 font-mono text-xs"
                        style={{ color: "var(--color-sumi600)" }}
                      >
                        {deal.deal_code}
                      </td>
                      <td
                        className="px-3 py-2"
                        style={{ color: "var(--color-text-title)" }}
                      >
                        {deal.name}
                      </td>
                      <td className="px-3 py-2" style={{ color: "var(--color-sumi600)" }}>
                        {deal.deal_stage?.name ?? "—"}
                      </td>
                      <td
                        className="px-3 py-2 text-right font-mono"
                        style={{ color: "var(--color-text-title)" }}
                      >
                        {deal.amount != null
                          ? jpyCurrency.format(deal.amount)
                          : "—"}
                      </td>
                      <td className="px-3 py-2" style={{ color: "var(--color-sumi600)" }}>
                        {deal.owner?.full_name ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 最近のアクティビティ */}
        <div
          className="p-6"
          style={{
            backgroundColor: "#fff",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--elevation-low)",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-base font-bold"
              style={{ color: "var(--color-text-title)" }}
            >
              最近のアクティビティ
            </h2>
            <EntityLink href="/activities" compact>
              すべて見る
            </EntityLink>
          </div>
          {recentActivitiesError ? (
            <p className="text-sm" style={{ color: "var(--color-sumi600)" }}>
              データを取得できませんでした
            </p>
          ) : !recentActivities || recentActivities.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-sumi500)" }}>
              アクティビティがありません
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "var(--color-sumi50)" }}>
                    <th
                      className="text-left px-3 py-2 font-semibold text-xs"
                      style={{ color: "var(--color-sumi600)" }}
                    >
                      種別
                    </th>
                    <th
                      className="text-left px-3 py-2 font-semibold text-xs"
                      style={{ color: "var(--color-sumi600)" }}
                    >
                      相手先
                    </th>
                    <th
                      className="text-left px-3 py-2 font-semibold text-xs"
                      style={{ color: "var(--color-sumi600)" }}
                    >
                      担当者
                    </th>
                    <th
                      className="text-left px-3 py-2 font-semibold text-xs"
                      style={{ color: "var(--color-sumi600)" }}
                    >
                      日時
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivities.map((act) => (
                    <tr
                      // id は記録元テーブルの ID。テーブルをまたぐと衝突しうる
                      key={`${act.source_kind}:${act.id}`}
                      style={{
                        borderBottom: "1px solid var(--color-border-default)",
                      }}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        <ActivityTypeBadge
                          name={act.activity_name}
                          color={act.activity_color}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <EntityLink
                          href={activityEntityHref(act.entity_type, act.entity_id)}
                          compact
                        >
                          {act.entity_label}
                        </EntityLink>
                      </td>
                      <td className="px-3 py-2" style={{ color: "var(--color-sumi600)" }}>
                        {act.actor_name ?? "—"}
                      </td>
                      <td
                        className="px-3 py-2 text-xs whitespace-nowrap"
                        style={{ color: "var(--color-sumi600)" }}
                      >
                        {act.occurred_at
                          ? formatOccurredAt(act.occurred_at, act.has_time)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 担当者別ディール数 */}
        <div
          className="p-6"
          style={{
            backgroundColor: "#fff",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--elevation-low)",
          }}
        >
          <h2
            className="text-base font-bold mb-4"
            style={{ color: "var(--color-text-title)" }}
          >
            担当者別商談数
          </h2>
          {ownerDealsError ? (
            <p className="text-sm" style={{ color: "var(--color-sumi600)" }}>
              データを取得できませんでした
            </p>
          ) : ownerStats.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-sumi500)" }}>
              進行中の商談がありません
            </p>
          ) : (
            <div className="space-y-3">
              {ownerStats.map((owner) => (
                <div
                  key={owner.name}
                  className="flex items-center justify-between py-2"
                  style={{
                    borderBottom: "1px solid var(--color-border-default)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <User
                      size={16}
                      style={{ color: "var(--color-sumi400)" }}
                    />
                    <span
                      className="text-sm font-medium"
                      style={{ color: "var(--color-text-title)" }}
                    >
                      {owner.name}
                    </span>
                  </div>
                  <span
                    className="text-sm font-bold"
                    style={{ color: "var(--color-terra)" }}
                  >
                    {owner.count}件
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
