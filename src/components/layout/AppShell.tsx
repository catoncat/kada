'use client';

import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import {
  FolderKanban,
  Image,
  Package,
  Search,
  Settings2,
  Shirt,
  Users,
} from 'lucide-react';
import type * as React from 'react';
import { useCallback } from 'react';
import { useCommandSearchContext } from '@/components/CommandSearch';
import { TaskQueueIndicator } from '@/components/TaskQueueDrawer';
import { Button } from '@/components/ui/button';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { openSettingsWindow } from '@/lib/open-settings-window';
import { cn } from '@/lib/utils';

type AppShellProps = {
  children: React.ReactNode;
  contextPanel?: React.ReactNode;
};

export function AppShell({ children, contextPanel }: AppShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;
  const { setOpen } = useCommandSearchContext();
  const isProjectsPage =
    pathname === '/' ||
    pathname === '/index.html' ||
    pathname === '/index.html/';
  const isProjectScenesPage = /^\/project\/[^/]+\/scenes$/.test(pathname);
  const needsFixedHeight =
    isProjectsPage ||
    pathname.startsWith('/assets/models') ||
    pathname.startsWith('/assets/scenes') ||
    isProjectScenesPage;
  const currentSectionLabel = isProjectsPage
    ? '项目'
    : pathname.startsWith('/assets/scenes')
      ? '场景资产'
      : pathname.startsWith('/assets/models')
        ? '模特资产'
        : pathname.startsWith('/settings')
          ? '设置'
          : pathname.startsWith('/project/')
            ? '项目详情'
            : '工作台';

  const isActive = useCallback(
    (to: string, exact?: boolean) => {
      if (exact) return pathname === to;
      return pathname.startsWith(to);
    },
    [pathname],
  );

  const handleOpenSettings = useCallback(() => {
    openSettingsWindow(() => navigate({ to: '/settings' }));
  }, [navigate]);

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>工作区</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isActive('/', true)}
                    render={<Link to="/" />}
                    tooltip="项目"
                  >
                    <FolderKanban />
                    <span>项目</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup>
            <SidebarGroupLabel>资产</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isActive('/assets/scenes')}
                    render={<Link to="/assets/scenes" />}
                    tooltip="场景"
                  >
                    <Image />
                    <span>场景</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isActive('/assets/models')}
                    render={<Link to="/assets/models" />}
                    tooltip="模特"
                  >
                    <Users />
                    <span>模特</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton disabled tooltip="服装（待开发）">
                    <Shirt />
                    <span>服装</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton disabled tooltip="道具（待开发）">
                    <Package />
                    <span>道具</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleOpenSettings} tooltip="设置">
                <Settings2 />
                <span>设置</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header
          data-tauri-drag-region
          className="app-toolbar select-none border-b"
        >
          <div className="app-toolbar-row flex items-center gap-2 px-3">
            <SidebarTrigger className="shrink-0" />
            <div className="hidden min-w-[8.5rem] items-center gap-1 text-xs md:flex">
              <span className="font-semibold text-foreground">Kada 咔哒</span>
              <span className="text-muted-foreground">
                {currentSectionLabel}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setOpen(true)}
              className={cn(
                'flex h-[var(--control-h)] min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-background/70 px-2.5 text-left text-sm text-muted-foreground',
                'hover:border-border hover:bg-background hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
              )}
            >
              <Search className="size-3.5 shrink-0 opacity-70" />
              <span className="truncate">搜索项目、场景、任务…</span>
              <span className="ms-auto shrink-0">
                <KbdGroup>
                  <Kbd>⌘</Kbd>
                  <Kbd>K</Kbd>
                </KbdGroup>
              </span>
            </button>

            <div className="flex shrink-0 items-center gap-1.5">
              <TaskQueueIndicator />
              <Button
                aria-label="设置"
                onClick={handleOpenSettings}
                size="icon-sm"
                variant="ghost"
              >
                <Settings2 className="size-3.5" />
              </Button>
            </div>
          </div>
        </header>

        <div className="app-shell-content flex min-h-0 flex-1">
          <div
            className={cn(
              'min-w-0 min-h-0 flex-1',
              needsFixedHeight ? 'overflow-hidden' : 'overflow-auto',
            )}
          >
            {children}
          </div>
          {contextPanel ? (
            <aside className="app-context-panel hidden w-80 shrink-0 border-l p-4 lg:block">
              {contextPanel}
            </aside>
          ) : null}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
