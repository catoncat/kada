import { createFileRoute } from '@tanstack/react-router';
import SettingsPanel from '@/components/SettingsPanel';
import { isSettingsWindow } from '@/lib/open-settings-window';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  // 独立窗口模式：铺满整个窗口，无额外边距
  if (isSettingsWindow()) {
    return <SettingsPanel standalone />;
  }

  // 主窗口内嵌模式（浏览器 fallback）
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          配置 AI 模型和其他系统选项
        </p>
      </div>

      <SettingsPanel embedded />
    </div>
  );
}
