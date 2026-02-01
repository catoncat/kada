import { createRootRoute, Outlet } from '@tanstack/react-router';
import { AppShell } from '@/components/layout/AppShell';
import { TaskQueueProvider } from '@/contexts/TaskQueueContext';
import { TaskQueueDrawer } from '@/components/TaskQueueDrawer';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <TaskQueueProvider>
      <AppShell>
        <Outlet />
      </AppShell>

      <TaskQueueDrawer />
    </TaskQueueProvider>
  );
}
