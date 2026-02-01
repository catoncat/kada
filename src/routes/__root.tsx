import { createRootRoute, Outlet, Link, useLocation } from '@tanstack/react-router';
import { FolderKanban, Layers, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TaskQueueProvider } from '@/contexts/TaskQueueContext';
import { TaskQueueDrawer, TaskQueueIndicator } from '@/components/TaskQueueDrawer';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const location = useLocation();

  const navItems = [
    { to: '/', label: '项目列表', icon: FolderKanban, exact: true },
    { to: '/assets', label: '资产管理', icon: Layers },
    { to: '/settings', label: '设置', icon: Settings },
  ];

  const isActive = (to: string, exact?: boolean) => {
    if (exact) return location.pathname === to;
    return location.pathname.startsWith(to);
  };

  return (
    <TaskQueueProvider>
      <div className="min-h-screen bg-[var(--paper)]">
        {/* 顶部导航 */}
        <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-white/80 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex h-14 items-center justify-between">
              {/* Logo / 品牌 */}
              <Link to="/" className="flex items-center gap-2">
                <span className="text-lg font-semibold text-[var(--ink)]">拍摄预案助手</span>
                <span className="text-xs px-1.5 py-0.5 rounded-md bg-[var(--primary)] text-white font-medium">v2</span>
              </Link>

              {/* 导航链接 + 任务指示器 */}
              <div className="flex items-center gap-4">
                <nav className="flex items-center gap-1">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.to, item.exact);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                          active
                            ? 'bg-[var(--primary)] text-white'
                            : 'text-[var(--ink-2)] hover:bg-[var(--paper-2)] hover:text-[var(--ink)]'
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>

                {/* 任务队列指示器 */}
                <TaskQueueIndicator />
              </div>
            </div>
          </div>
        </header>

        {/* 页面内容 */}
        <main>
          <Outlet />
        </main>

        {/* 任务队列抽屉 */}
        <TaskQueueDrawer />
      </div>
    </TaskQueueProvider>
  );
}
