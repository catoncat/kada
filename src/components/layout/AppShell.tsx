'use client';

import { Link, useLocation } from '@tanstack/react-router';
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
import { cn } from '@/lib/utils';

type AppShellProps = {
  children: React.ReactNode;
  contextPanel?: React.ReactNode;
};

export function AppShell({ children, contextPanel }: AppShellProps) {
  const location = useLocation();
  const pathname = location.pathname;
  const { setOpen } = useCommandSearchContext();
  const isProjectsPage =
    pathname === '/' ||
    pathname === '/index.html' ||
    pathname === '/index.html/';
  const needsFixedHeight =
    isProjectsPage || pathname.startsWith('/assets/models');

  const isActive = (to: string, exact?: boolean) => {
    if (exact) return pathname === to;
    return pathname.startsWith(to);
  };

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
              <SidebarMenuButton
                isActive={isActive('/settings')}
                render={<Link to="/settings" />}
                tooltip="设置"
              >
                <Settings2 />
                <span>设置</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-sm">
          <SidebarTrigger className="shrink-0" />

          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left text-sm text-muted-foreground shadow-xs/5',
              'hover:bg-accent/50 hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
          >
            <Search className="size-4 shrink-0 opacity-70" />
            <span className="truncate">搜索…</span>
            <span className="ms-auto shrink-0">
              <KbdGroup>
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </KbdGroup>
            </span>
          </button>

          <div className="flex shrink-0 items-center gap-2">
            <TaskQueueIndicator />
            <Button
              aria-label="设置"
              render={<Link to="/settings" />}
              size="icon"
              variant="ghost"
            >
              <Settings2 className="size-4" />
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <div
            className={cn(
              'min-w-0 min-h-0 flex-1',
              // Projects 首页：左右两栏各自滚动，避免父级滚动干扰
              needsFixedHeight ? 'overflow-hidden' : 'overflow-auto',
            )}
          >
            {children}
          </div>
          {contextPanel ? (
            <aside className="hidden w-80 shrink-0 border-l bg-background/60 p-4 lg:block">
              {contextPanel}
            </aside>
          ) : null}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
