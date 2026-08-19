import type React from "react";
import type { Agent, Theme } from "@/lib/api";
import {
  MessageSquare,
  Video,
  Calendar,
  Mail,
  Settings,
  Bot,
} from "lucide-react";

import { KapixLogo } from "@/components/KapixLogo";

export type NavTab = "chat" | "meetings" | "calendar" | "mailbox" | "kapix_agent";

interface TabItem {
  id: NavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string | null;
  badgeColor?: string;
}

interface Props {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  agent: Agent;
  theme: Theme;
  emailCount?: number;
  unreadMessagesCount?: number;
  onOpenSettings: () => void;
}

export function TopNav({
  activeTab,
  onTabChange,
  agent,
  theme,
  emailCount = 0,
  unreadMessagesCount = 0,
  onOpenSettings,
}: Props) {
  const tabs: TabItem[] = [
    {
      id: "chat",
      label: "Mensajes",
      icon: MessageSquare,
      badge: unreadMessagesCount > 0 ? unreadMessagesCount : null,
      badgeColor: "bg-indigo-500 text-white",
    },
    {
      id: "kapix_agent",
      label: "Kapix Agent",
      icon: Bot,
    },
    {
      id: "meetings",
      label: "Reuniones",
      icon: Video,
    },
    {
      id: "calendar",
      label: "Agenda",
      icon: Calendar,
    },
    {
      id: "mailbox",
      label: "Buzón de Soporte",
      icon: Mail,
      badge: emailCount > 0 ? `${emailCount}` : null,
      badgeColor: "bg-indigo-600 text-white",
    },
  ];

  return (
    <header
      className="h-12 w-full border-b border-white/[0.08] flex items-center justify-between px-3.5 select-none shrink-0 z-30 transition-colors"
      style={{ background: theme.sidebar }}
    >
      {/* Izquierda: Logo & Workspace */}
      <div className="flex items-center gap-2.5 min-w-[200px]">
        <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center shadow-xs">
          <KapixLogo className="w-5 h-5" />
        </div>
        <div className="flex flex-col">
          <h1
            className="text-white font-bold text-xs tracking-tight flex items-center gap-1 leading-none"
            style={theme.glow ? { textShadow: `0 0 8px ${theme.glow}` } : undefined}
          >
            Kasupport
          </h1>
          <span className="text-[9px] text-zinc-400 font-medium leading-tight">Workspace</span>
        </div>
      </div>

      {/* Centro: Barra de Pestañas */}
      <nav className="flex items-center gap-1 bg-black/20 dark:bg-black/35 p-1 rounded-xl border border-white/10 shadow-inner">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all relative ${
                isActive
                  ? "text-white shadow-sm font-semibold"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
              }`}
              style={
                isActive
                  ? {
                      background: theme.accent,
                      boxShadow: theme.glow ? `0 0 12px ${theme.glow}` : undefined,
                    }
                  : undefined
              }
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full leading-tight shadow-xs ${
                    isActive ? "bg-white/25 text-white" : tab.badgeColor || "bg-indigo-500 text-white"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Derecha: Acciones Rápidas y Configuración */}
      <div className="flex items-center gap-2.5 min-w-[200px] justify-end">
        <div className="flex items-center gap-2 px-2 py-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
          {agent.avatar ? (
            <img src={agent.avatar} alt={agent.name} className="w-5 h-5 rounded-lg object-cover" />
          ) : (
            <div className="w-5 h-5 rounded-lg bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">
              {agent.name.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-xs text-zinc-300 font-medium max-w-[100px] truncate hidden sm:inline">
            {agent.name}
          </span>
          {agent.status_emoji && (
            <span className="text-xs">{agent.status_emoji}</span>
          )}
        </div>

        <button
          onClick={onOpenSettings}
          title="Configuración"
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all border border-transparent hover:border-white/10"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
