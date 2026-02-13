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
        'inline-flex w-fit rounded-md bg-muted/80 p-0.5',
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
              'rounded-sm font-medium transition-all',
              size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm',
              isSelected
                ? 'bg-background text-foreground shadow-sm'
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
