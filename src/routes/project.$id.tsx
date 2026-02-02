import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/project/$id')({
  // 项目详情不再使用单独页面：访问 /project/:id 时重定向到 Projects 列表并在右侧打开详情
  beforeLoad: ({ location, params }) => {
    const basePath = `/project/${params.id}`;
    if (location.pathname === basePath || location.pathname === `${basePath}/`) {
      throw redirect({ to: '/', search: { project: params.id } });
    }
  },
  component: () => <Outlet />,
});
