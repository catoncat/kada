/**
 * 设置导航组件
 * 左侧导航菜单，支持切换不同设置区域
 */

import { Server, FileText, HardDrive } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SettingsSection = 'providers' | 'templates' | 'storage';

interface SettingsNavProps {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}

const NAV_ITEMS: { id: SettingsSection; label: string; icon: typeof Server }[] = [
  { id: 'providers', label: '服务商', icon: Server },
  { id: 'templates', label: '系统提示词', icon: FileText },
  { id: 'storage', label: '存储管理', icon: HardDrive },
];

export function SettingsNav({ activeSection, onSectionChange }: SettingsNavProps) {
  return (
    <nav className="w-[200px] flex-shrink-0 border-r border-border p-4 bg-muted/20">
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
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <Icon className={cn(
                  'w-4 h-4',
                  isActive ? 'text-primary' : 'text-muted-foreground'
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
