import { CheckCircle2, CircleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExecutionChecklistSnapshot } from './types';

const CHECKLIST_ITEMS: Array<{
  key: keyof ExecutionChecklistSnapshot['checks'];
  label: string;
  hint: string;
}> = [
  {
    key: 'sceneReferenceReady',
    label: '场景参考图已确定',
    hint: '必须有 scene 参考图作为执行基础。',
  },
  {
    key: 'identityCollageReady',
    label: '人物拼接图可用',
    hint: '多人场景必须提供人物拼接参考图。',
  },
  {
    key: 'identityMappingComplete',
    label: '编号映射完整',
    hint: '编号需覆盖期望人数且连续。',
  },
  {
    key: 'aspectRatioLocked',
    label: '画幅与硬约束已锁定',
    hint: '默认 photo，可在修复时覆盖。',
  },
  {
    key: 'singleFrameDeclared',
    label: '输出为单帧静态图',
    hint: '执行策略声明，不允许动图。',
  },
];

export function ExecutionChecklistCard({
  snapshot,
  className,
}: {
  snapshot: ExecutionChecklistSnapshot;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border bg-muted/20 p-3', className)}>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-medium">执行清单</h4>
        <span className="text-xs text-muted-foreground">
          {snapshot.allPassed ? '可确认' : '需补充信息'}
        </span>
      </div>

      <div className="space-y-2">
        {CHECKLIST_ITEMS.map((item) => {
          const passed = snapshot.checks[item.key];
          return (
            <div
              key={item.key}
              className="flex items-start gap-2 rounded-lg border bg-background px-2.5 py-2"
            >
              {passed ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
              ) : (
                <CircleAlert className="mt-0.5 h-4 w-4 text-amber-600" />
              )}
              <div>
                <p className="text-sm">{item.label}</p>
                {!passed && (
                  <p className="text-xs text-muted-foreground">{item.hint}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
