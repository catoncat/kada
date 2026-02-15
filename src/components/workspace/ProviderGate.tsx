import { AlertTriangle, Settings2 } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { openSettingsWindow } from '@/lib/open-settings-window';
import type { ReactNode } from 'react';

export function ProviderGate({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const navigate = useNavigate();

  if (enabled) return <>{children}</>;

  return (
    <div className="flex h-full min-h-0 items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold">工作台已禁用</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          需要先配置默认 Provider 才能使用 Chat + 画布工作台。
        </p>

        <Button
          className="mt-6"
          onClick={() => {
            openSettingsWindow(() => navigate({ to: '/settings' }));
          }}
        >
          <Settings2 className="mr-2 h-4 w-4" />
          前往设置
        </Button>
      </div>
    </div>
  );
}
