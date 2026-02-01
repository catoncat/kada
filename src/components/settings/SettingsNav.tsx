/**
 * 设置导航组件
 * 左侧导航菜单，支持切换不同设置区域
 */

import { Server, Sparkles, Store } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SettingsSection = 'providers' | 'topics' | 'studio';

interface SettingsNavProps {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}

const NAV_ITEMS: { id: SettingsSection; label: string; icon: typeof Server }[] = [
  { id: 'providers', label: '服务商', icon: Server },
  { id: 'topics', label: '主题提示词', icon: Sparkles },
  { id: 'studio', label: '工作室配置', icon: Store },
];

export function SettingsNav({ activeSection, onSectionChange }: SettingsNavProps) {
  return (
    <nav className="w-[200px] flex-shrink-0 border-r border-[var(--line)] p-4">
      <ul className="space-y-1">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;

          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSectionChange(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition',
                  isActive
                    ? 'bg-primary/10 text-[var(--ink)]'
                    : 'text-[var(--ink-2)] hover:bg-gray-100'
                )}
              >
                <Icon className={cn(
                  'w-4 h-4',
                  isActive ? 'text-primary' : 'text-[var(--ink-3)]'
                )} />
                <span>{item.label}</span>
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
