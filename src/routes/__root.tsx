import { createRootRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { AppShell } from '@/components/layout/AppShell';
import { TaskQueueProvider } from '@/contexts/TaskQueueContext';
import { TaskQueueDrawer } from '@/components/TaskQueueDrawer';
import {
  CommandSearchProvider,
  CommandSearchDialog,
} from '@/components/CommandSearch';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
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

