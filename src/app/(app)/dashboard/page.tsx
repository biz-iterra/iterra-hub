import { TrendingUp, DollarSign, Target, Plus, Clock, BarChart3 } from "lucide-react";

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

export default function DashboardPage() {
  return (
    <div>
      <h1
        className="text-2xl font-bold mb-6"
        style={{ color: "var(--color-text-title)" }}
      >
        ダッシュボード
      </h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
        <KpiCard
          label="進行中ディール"
          value="—"
          sub="Supabase 接続後に表示"
          icon={Target}
        />
        <KpiCard
          label="進行中 合計金額"
          value="—"
          sub="Supabase 接続後に表示"
          icon={DollarSign}
        />
        <KpiCard
          label="今期クローズ"
          value="—"
          sub="Supabase 接続後に表示"
          icon={TrendingUp}
        />
        <KpiCard
          label="今期 新規作成"
          value="—"
          sub="Supabase 接続後に表示"
          icon={Plus}
        />
        <KpiCard
          label="平均ディール単価"
          value="—"
          sub="Supabase 接続後に表示"
          icon={BarChart3}
        />
        <KpiCard
          label="平均滞留日数"
          value="—"
          sub="Supabase 接続後に表示"
          icon={Clock}
        />
      </div>

      {/* Placeholder sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div
          className="p-6 min-h-64"
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
          <div
            className="flex items-center justify-center h-48 text-sm"
            style={{ color: "var(--color-sumi500)" }}
          >
            Supabase 接続後に表示
          </div>
        </div>

        <div
          className="p-6 min-h-64"
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
            担当者別 実績
          </h2>
          <div
            className="flex items-center justify-center h-48 text-sm"
            style={{ color: "var(--color-sumi500)" }}
          >
            Supabase 接続後に表示
          </div>
        </div>

        <div
          className="p-6 min-h-64"
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
            月別推移
          </h2>
          <div
            className="flex items-center justify-center h-48 text-sm"
            style={{ color: "var(--color-sumi500)" }}
          >
            Supabase 接続後に表示
          </div>
        </div>

        <div
          className="p-6 min-h-64"
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
            最近の対応履歴
          </h2>
          <div
            className="flex items-center justify-center h-48 text-sm"
            style={{ color: "var(--color-sumi500)" }}
          >
            Supabase 接続後に表示
          </div>
        </div>
      </div>
    </div>
  );
}
