import { SegmentedControl } from '@/components/ui/segmented-control';
import type { ResultMode } from './types';

const MODE_OPTIONS: Array<{ value: ResultMode; label: string; hint: string }> = [
  { value: 'plan', label: '规划', hint: '只改分镜，不出图' },
  { value: 'execute', label: '执行', hint: '锁定约束，按清单出图' },
  { value: 'review', label: '验收', hint: '看通过率、差异、导出' },
];

export function ResultModeSwitch({
  value,
  onValueChange,
}: {
  value: ResultMode;
  onValueChange: (value: ResultMode) => void;
}) {
  const current = MODE_OPTIONS.find((item) => item.value === value);

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          value={value}
          onValueChange={(next) => {
            if (!next) return;
            onValueChange(next as ResultMode);
          }}
          options={MODE_OPTIONS.map((item) => ({
            value: item.value,
            label: item.label,
          }))}
        />
        <p className="text-xs text-muted-foreground">{current?.hint}</p>
      </div>
    </div>
  );
}
