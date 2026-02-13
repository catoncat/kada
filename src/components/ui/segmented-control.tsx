import { cn } from '@/lib/utils';

type Option<T extends string> = {
  value: T;
  label: string;
};

/**
 * macOS 风格分段控件，适合 2-4 个互斥选项。
 *
 * ```tsx
 * <SegmentedControl
 *   value={gender}
 *   onValueChange={setGender}
 *   options={[
 *     { value: 'male', label: '男' },
 *     { value: 'female', label: '女' },
 *   ]}
 * />
 * ```
 */
function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  size = 'default',
  allowDeselect = false,
}: {
  value: T | '';
  onValueChange: (value: T | '') => void;
  options: Option<T>[];
  className?: string;
  size?: 'sm' | 'default';
  /** 允许点击已选中项来取消选择 */
  allowDeselect?: boolean;
}) {
  return (
    <div
      className={cn(
        'inline-flex w-fit items-center rounded-lg border border-border/60 bg-muted/70 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
        className,
      )}
    >
      {options.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              if (isSelected && allowDeselect) {
                onValueChange('' as T | '');
              } else {
                onValueChange(opt.value);
              }
            }}
            className={cn(
              'rounded-md font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
              size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm',
              isSelected
                ? 'bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.12)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.35)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export { SegmentedControl };
export type { Option as SegmentedControlOption };
