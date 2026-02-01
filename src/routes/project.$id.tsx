import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/project/$id')({
  component: () => <Outlet />,
});
