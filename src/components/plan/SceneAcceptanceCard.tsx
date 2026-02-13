import { CheckCircle2, CircleHelp, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type {
  AcceptanceResult,
  AcceptanceRuleStatus,
  GeneratedScene,
  SceneTaskTrack,
} from './types';

function statusBadgeVariant(status: AcceptanceRuleStatus) {
  if (status === 'pass') return 'success' as const;
  if (status === 'fail') return 'destructive' as const;
  return 'warning' as const;
}

function overallLabel(acceptance: AcceptanceResult): string {
  if (acceptance.overall === 'pass') return '已通过';
  if (acceptance.overall === 'fail') return '未通过';
  return '待补充信息';
}

export function SceneAcceptanceCard({
  scene,
  sceneIndex,
  acceptance,
  track,
  manuallyPassed,
  onFix,
  onOpenEdit,
  onViewTask,
  onMarkPassed,
}: {
  scene: GeneratedScene;
  sceneIndex: number;
  acceptance: AcceptanceResult;
  track?: SceneTaskTrack | null;
  manuallyPassed: boolean;
  onFix: (sceneIndex: number) => void;
  onOpenEdit: (sceneIndex: number) => void;
  onViewTask: (sceneIndex: number) => void;
  onMarkPassed: (sceneIndex: number) => void;
}) {
  const canMarkPassed =
    acceptance.failCount === 0 && acceptance.unknownCount === 0;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm text-muted-foreground">场景 {sceneIndex + 1}</div>
          <h3 className="text-base font-semibold">{scene.location}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusBadgeVariant(acceptance.overall)}>
            {overallLabel(acceptance)}
          </Badge>
          {manuallyPassed ? (
            <Badge variant="success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              已人工确认
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        {acceptance.rules.map((rule) => (
          <div
            key={rule.key}
            className="rounded-lg border bg-muted/20 px-3 py-2 text-sm"
          >
            <div className="mb-1 flex items-center gap-2">
              <Badge variant={statusBadgeVariant(rule.status)} size="sm">
                {rule.status === 'pass'
                  ? '通过'
                  : rule.status === 'fail'
                    ? '失败'
                    : '待补充'}
              </Badge>
              <span className="font-medium">{rule.label}</span>
            </div>
            <p className="text-xs text-muted-foreground">{rule.reason}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {acceptance.failCount > 0 ? (
          <Button size="sm" onClick={() => onFix(sceneIndex)}>
            <ShieldAlert className="h-3.5 w-3.5" />
            一键修复
          </Button>
        ) : null}
        {acceptance.unknownCount > 0 ? (
          <Button size="sm" variant="outline" onClick={() => onOpenEdit(sceneIndex)}>
            <CircleHelp className="h-3.5 w-3.5" />
            补充信息
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onMarkPassed(sceneIndex)}
          disabled={!canMarkPassed || manuallyPassed}
        >
          标记通过（可追溯）
        </Button>
        {track?.taskId ? (
          <Button size="sm" variant="ghost" onClick={() => onViewTask(sceneIndex)}>
            查看任务
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
