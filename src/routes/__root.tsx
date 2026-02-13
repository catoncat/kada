import { createRootRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { AppShell } from '@/components/layout/AppShell';
import { TaskQueueProvider } from '@/contexts/TaskQueueContext';
import { TaskQueueDrawer } from '@/components/TaskQueueDrawer';
import {
  CommandSearchProvider,
  CommandSearchDialog,
} from '@/components/CommandSearch';
import { isSettingsWindow } from '@/lib/open-settings-window';

export const Route = createRootRoute({
  component: RootLayout,
});

/** 设置窗口：只在模块加载时判断一次 */
const _isSettingsWindow = isSettingsWindow();

function RootLayout() {
  // 独立设置窗口：精简布局，不需要 sidebar / command search
  if (_isSettingsWindow) {
    return (
      <TaskQueueProvider>
        <div className="flex h-full flex-col">
          {/* macOS titlebar 拖拽区域 */}
          <div
            data-tauri-drag-region
            className="h-[var(--titlebar-h)] w-full shrink-0"
          />
          <div className="flex-1 overflow-auto">
            <Outlet />
          </div>
        </div>
      </TaskQueueProvider>
    );
  }

  return <MainLayout />;
}

function MainLayout() {
  const navigate = useNavigate();

  // 创建项目：导航到首页并附带 action 参数
  const handleCreateProject = () => {
    navigate({ to: '/', search: { action: 'create' } });
  };

  // 创建场景：导航到场景页面并附带 action 参数
  const handleCreateScene = () => {
    navigate({ to: '/assets/scenes', search: { action: 'create' } });
  };

  return (
    <TaskQueueProvider>
      <CommandSearchProvider>
        <AppShell>
          <Outlet />
        </AppShell>

        <CommandSearchDialog
          onCreateProject={handleCreateProject}
          onCreateScene={handleCreateScene}
        />
        <TaskQueueDrawer />
      </CommandSearchProvider>
    </TaskQueueProvider>
  );
}

