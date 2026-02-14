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
        'inline-flex w-fit items-center rounded-md border border-input/85 bg-muted/62 p-0.5',
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
              'rounded-[calc(var(--radius)-1px)] font-medium transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
              size === 'sm'
                ? 'h-[var(--control-h-sm)] px-2 text-xs'
                : 'h-[var(--control-h)] px-2.5 text-sm',
              isSelected
                ? 'bg-background/95 text-foreground ring-1 ring-border/70'
                : 'text-muted-foreground hover:bg-muted/86 hover:text-foreground',
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
