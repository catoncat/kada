import { createFileRoute, Outlet, Link, useLocation } from '@tanstack/react-router';
import { ImageIcon, Package, Shirt } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/assets')({
  component: AssetsLayout,
});

function AssetsLayout() {
  const location = useLocation();

  const tabs = [
    { to: '/assets/scenes', label: '场景', icon: ImageIcon },
    { to: '/assets/props', label: '道具', icon: Package, disabled: true },
    { to: '/assets/outfits', label: '服装', icon: Shirt, disabled: true },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[var(--ink)]">资产管理</h1>
        <p className="mt-1 text-sm text-[var(--ink-2)]">
          管理你的拍摄场景、道具和服装资产
        </p>
      </div>

      {/* 子导航标签 */}
      <div className="border-b border-[var(--line)] mb-6">
        <nav className="flex gap-6">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = location.pathname === tab.to ||
              (tab.to === '/assets/scenes' && location.pathname === '/assets');

            if (tab.disabled) {
              return (
                <span
                  key={tab.to}
                  className="flex items-center gap-2 py-3 text-sm font-medium text-[var(--ink-3)] cursor-not-allowed"
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  <span className="text-xs bg-[var(--paper-2)] px-1.5 py-0.5 rounded">待开发</span>
                </span>
              );
            }

            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  'flex items-center gap-2 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                  isActive
                    ? 'border-[var(--primary)] text-[var(--ink)]'
                    : 'border-transparent text-[var(--ink-2)] hover:text-[var(--ink)] hover:border-[var(--line)]'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* 子路由内容 */}
      <Outlet />
    </div>
  );
}
