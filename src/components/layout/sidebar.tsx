"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Handshake,
  Users,
  Building2,
  Briefcase,
  FileText,
  UserCircle,
  Settings,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  UserSearch,
  Megaphone,
  Activity,
  CreditCard,
  MessageSquare,
  TrendingUp,
  PhoneCall,
  UsersRound,
  Upload,
  ScrollText,
  Landmark,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { CrmUserRole } from "@/types/enums";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  roles?: CrmUserRole[];
  /** 直前の項目に従属することを字下げで示す */
  nested?: boolean;
  /** ホバー時に出す補足。項目の役割が名前だけでは伝わらないものに付ける */
  description?: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

/**
 * 連続する nested 項目を 1 つの塊にまとめる。
 * 塊単位で左ガイド線を引くことで、項目間の余白で線が途切れるのを防ぐ。
 */
function chunkByNesting(items: NavItem[]): { nested: boolean; items: NavItem[] }[] {
  return items.reduce<{ nested: boolean; items: NavItem[] }[]>((acc, item) => {
    const nested = item.nested === true;
    const last = acc[acc.length - 1];
    if (last && last.nested === nested) last.items.push(item);
    else acc.push({ nested, items: [item] });
    return acc;
  }, []);
}

const navGroups: NavGroup[] = [
  {
    label: "ダッシュボード",
    items: [
      { label: "ダッシュボード", href: "/dashboard", icon: LayoutDashboard },
      {
        label: "アクティビティ",
        href: "/activities",
        icon: Activity,
        description: "社内対応・顧客行動・メールの時系列",
      },
    ],
  },
  {
    label: "マーケティング",
    items: [
      { label: "リード", href: "/leads", icon: UserSearch },
      // カテゴリごとに追い方が違うので画面を分ける。
      // SQL（商談化したもの）は商談で追うため、ここには置かない
      {
        label: "問い合わせ進捗",
        href: "/progress/inquiry",
        icon: MessageSquare,
        nested: true,
        description: "サイトから来た問い合わせ（Inquiry）",
      },
      {
        label: "インバウンド進捗",
        href: "/progress/inbound",
        icon: TrendingUp,
        nested: true,
        description: "紹介・セミナー・名刺交換（MQL）",
      },
      {
        label: "アウトバウンド進捗",
        href: "/progress/outbound",
        icon: PhoneCall,
        nested: true,
        description: "架電・DM（TQL）",
      },
      { label: "キャンペーン", href: "/campaigns", icon: Megaphone },
    ],
  },
  {
    label: "営業",
    items: [
      { label: "商談", href: "/deals", icon: Handshake },
      { label: "契約", href: "/contracts", icon: FileText, roles: ["manager", "admin"] },
      { label: "プロジェクト", href: "/projects", icon: FolderKanban },
    ],
  },
  {
    label: "顧客情報",
    // 取引先を主役に置き、そこに従属する 3 つを字下げして包含関係を示す
    items: [
      {
        label: "取引先",
        href: "/accounts",
        icon: Briefcase,
        description: "契約・商談の主体",
      },
      {
        label: "事業者情報",
        href: "/companies",
        icon: Building2,
        nested: true,
        // 契約前の相手も個人事業主も入るので「取引先の」とは限らない
        description: "事業者の法的情報（登記・インボイス）",
      },
      {
        label: "連絡先",
        href: "/contacts",
        icon: Users,
        nested: true,
        description: "取引先に属する個人",
      },
      {
        label: "名刺",
        href: "/contacts/cards",
        icon: CreditCard,
        nested: true,
        description: "所属の記録と紹介者",
      },
      {
        label: "タレント",
        href: "/talents",
        icon: UserCircle,
        nested: true,
        description: "連絡先の人材特性",
      },
    ],
  },
  {
    label: "管理",
    items: [
      {
        label: "各種設定",
        href: "/admin",
        icon: Settings,
        roles: ["admin"],
        description: "マスタの管理",
      },
      {
        label: "メンバー管理",
        href: "/admin/members",
        icon: UsersRound,
        roles: ["admin"],
        description: "CRM を使う人の追加・停止",
      },
      {
        label: "インポート",
        href: "/admin/leads/import",
        icon: Upload,
        roles: ["admin"],
        description: "Eight 名刺データの取込",
      },
      {
        label: "freee 連携",
        href: "/admin/freee",
        icon: Landmark,
        roles: ["admin"],
        description: "会計の取引先と突き合わせる",
      },
      // ログは自分の操作を追えるよう admin 限定にしない。
      // 参照できる範囲は RLS が決める（manager 以上は全件、他は自分の変更のみ）
      {
        label: "ログ",
        href: "/admin/logs",
        icon: ScrollText,
        description: "データの変更履歴",
      },
    ],
  },
];

/** 選択中の判定で「より深いパスの項目」を探すために使う */
const allHrefs = navGroups.flatMap((g) => g.items.map((i) => i.href));

export function Sidebar({
  userRole = "admin",
  navOpen = false,
  onClose,
}: {
  userRole?: CrmUserRole;
  /** lg 未満でドロワーとして開いているか */
  navOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (!pathname.startsWith(href)) return false;

    // 前方一致だけだと、/contacts/cards で「連絡先」と「名刺」が両方光る。
    // より深いパスを持つ項目が当たっているなら、そちらに譲る
    return !allHrefs.some(
      (other) =>
        other !== href && other.startsWith(href) && pathname.startsWith(other)
    );
  };

  const canAccess = (item: NavItem) => {
    if (!item.roles) return true;
    return item.roles.includes(userRole);
  };

  return (
    <aside
      className={cn(
        // 幅と開閉のアニメーションは globals.css の .nav-drawer が持つ
        "nav-drawer flex flex-col h-screen shrink-0 overflow-hidden",
        // lg 未満はドロワー。画面外に置いておき、開いたときだけ滑り込ませる
        "fixed inset-y-0 left-0",
        navOpen ? "translate-x-0" : "-translate-x-full",
        // lg 以上は常設に戻す
        "lg:static lg:translate-x-0"
      )}
      data-open={navOpen}
      data-collapsed={collapsed}
      style={{ backgroundColor: "var(--color-terra)", zIndex: "var(--zindex-drawer)" }}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-14 px-4">
        <span className="text-white font-bold text-lg tracking-tight">
          {/* 折りたたみは lg 以上だけ。ドロワーでは常に正式名称を出す */}
          <span className={cn(collapsed && "lg:hidden")}>ITERRA CRM</span>
          {collapsed && <span className="hidden lg:inline">I</span>}
        </span>

        {/* ドロワーを閉じる。常設表示の lg 以上では出さない */}
        <button
          type="button"
          onClick={onClose}
          aria-label="メニューを閉じる"
          className="tap-target flex items-center justify-center cursor-pointer lg:hidden"
          style={{ color: "rgba(255,255,255,0.7)" }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {navGroups.map((group, groupIndex) => {
          const visibleItems = group.items.filter(canAccess);
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.label} className={cn(groupIndex > 0 && "mt-2")}>
              {/*
                Group header。
                折りたたみはアイコンのみの表示にするため見出しを消すが、
                折りたたみが効くのは lg 以上。ドロワーでは常に出す
              */}
              <p
                className={cn(
                  "px-5 mb-1 text-xs font-semibold uppercase tracking-widest select-none",
                  collapsed && "lg:hidden"
                )}
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                {group.label}
              </p>

              <div className="space-y-0.5">
                {chunkByNesting(visibleItems).map((chunk, chunkIndex) => {
                  const indented = chunk.nested;
                  return (
                    <div
                      key={chunkIndex}
                      className={cn(
                        "space-y-0.5",
                        indented && "ml-5 pl-1 border-l",
                        // 折りたたみ時はアイコンだけが並ぶので、字下げ・ガイド線は消す
                        indented && collapsed && "lg:ml-0 lg:pl-0 lg:border-l-0"
                      )}
                      style={
                        indented
                          ? { borderColor: "rgba(255,255,255,0.2)" }
                          : undefined
                      }
                    >
                      {chunk.items.map((item) => {
                        const active = isActive(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2.5 text-sm transition-colors",
                              indented ? "mr-2" : "mx-2",
                              collapsed && "lg:justify-center lg:px-0 lg:mx-2"
                            )}
                            style={{
                              color: active ? "#fff" : "rgba(255,255,255,0.7)",
                              backgroundColor: active
                                ? "var(--color-terra-dark)"
                                : "transparent",
                              borderRadius: "var(--radius-md)",
                            }}
                            onMouseEnter={(e) => {
                              if (!active)
                                e.currentTarget.style.backgroundColor =
                                  "var(--color-terra-dark)";
                            }}
                            onMouseLeave={(e) => {
                              if (!active)
                                e.currentTarget.style.backgroundColor = "transparent";
                            }}
                            title={collapsed ? item.label : item.description}
                          >
                            <item.icon size={indented ? 18 : 20} />
                            <span className={cn(collapsed && "lg:hidden")}>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle。畳める幅がない lg 未満では出さない */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? "サイドバーを広げる" : "サイドバーを畳む"}
        className={cn(
          "hidden lg:flex items-center h-10 mx-2 mb-3 cursor-pointer transition-colors",
          collapsed ? "justify-center" : "justify-end px-3"
        )}
        style={{
          color: "rgba(255,255,255,0.5)",
          borderRadius: "var(--radius-md)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--color-terra-dark)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
    </aside>
  );
}
