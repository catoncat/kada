'use client';

import { useState } from 'react';
import { Plus, Menu, History, Settings as SettingsIcon, MessageSquare, Trash2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { PlanRecord } from '@/hooks/usePlans';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarProps {
  onNewChat: () => void;
  history: PlanRecord[];
  onSelectHistory: (plan: PlanRecord) => void;
  onDeleteHistory?: (id: string) => void;
  currentId?: string;
}

export default function Sidebar({ onNewChat, history, onSelectHistory, onDeleteHistory, currentId }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside 
      className={cn(
        "h-screen transition-all duration-300 flex flex-col border-r border-[var(--line)]",
        "bg-[linear-gradient(180deg,var(--paper),var(--paper-2))]",
        
        isCollapsed ? "w-20" : "w-72"
      )}
    >
      <div className="p-4 flex items-center justify-between">
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-2 rounded-full transition-colors hover:bg-gray-100"
        >
          <Menu className="w-6 h-6 text-[var(--ink-2)]" />
        </button>
      </div>

      <div className="px-3 mt-4">
        <button 
          onClick={onNewChat}
          className={cn(
            "flex items-center gap-3 overflow-hidden",
            "py-3 rounded-2xl border border-[var(--line)]",
            "bg-white/70 hover:bg-white/90 transition-colors",
            "shadow-sm",
            isCollapsed ? "justify-center w-12 mx-auto" : "px-4 w-full"
          )}
        >
          <Plus className="w-5 h-5 text-primary" />
          {!isCollapsed && (
            <span className="font-semibold text-[var(--ink)] whitespace-nowrap tracking-wide">开启新预案</span>
          )}
        </button>
      </div>

      <div className="mt-8 flex-1 flex flex-col overflow-hidden px-3">
        {!isCollapsed && (
          <h3 className="px-4 text-[10px] font-bold text-[var(--ink-3)] uppercase tracking-[0.24em] mb-4">
            历史预案 ({history.length})
          </h3>
        )}
        
        <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
          {history.length === 0 ? (
            !isCollapsed && (
              <div className="px-4 py-10 text-center">
                <History className="w-8 h-8 text-[var(--ink-3)] mx-auto mb-3 opacity-60" />
                <p className="text-xs text-[var(--ink-3)] tracking-wide">暂无历史记录</p>
              </div>
            )
          ) : (
            history.map((plan) => (
              <div
                key={plan.id}
                className={cn(
                  "flex items-center gap-3 w-full rounded-2xl transition-all text-left group",
                  "border border-transparent",
                  isCollapsed ? "justify-center" : "px-2"
                )}
              >
                <button
                  onClick={() => onSelectHistory(plan)}
                  className={cn(
                    "flex items-center gap-3 flex-1 p-3 rounded-2xl transition-colors text-left",
                    currentId === plan.id
                      ? "bg-white shadow-sm border border-[var(--line)] text-primary"
                      : "text-[var(--ink-2)] hover:bg-gray-100"
                  )}
                >
                  <MessageSquare
                    className={cn(
                      "w-4 h-4 flex-shrink-0",
                      currentId === plan.id ? "text-primary" : "text-[var(--ink-3)]"
                    )}
                  />
                  {!isCollapsed && (
                    <div className="overflow-hidden">
                      <div className="text-sm font-semibold truncate text-[var(--ink)]">
                        {plan.title}
                      </div>
                      <div className="text-[10px] text-[var(--ink-3)] truncate tracking-wider">
                        {plan.createdAt ? new Date(plan.createdAt).toLocaleDateString() : ''}
                      </div>
                    </div>
                  )}
                </button>

                {!isCollapsed && onDeleteHistory && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('确定要删除这条历史预案吗？')) {
                        onDeleteHistory(plan.id);
                      }
                    }}
                    className="p-2 rounded-xl text-[var(--ink-3)] hover:text-red-600 hover:bg-red-50 transition"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="p-4 border-t border-[var(--line)]">
        <div
          className={cn(
            "flex items-center gap-3 text-[var(--ink-2)] hover:text-[var(--ink)] transition-colors cursor-default p-2",
            isCollapsed ? "justify-center" : ""
          )}
        >
          <SettingsIcon className="w-5 h-5" />
          {!isCollapsed && <span className="text-sm tracking-wide">设置管理</span>}
        </div>
      </div>
    </aside>
  );
}
