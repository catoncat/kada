import { cn } from '@/lib/utils';

/**
 * macOS 原生风格表单行：label 右对齐 + control 左对齐 + 底部分割线。
 *
 * 用法：
 * ```tsx
 * <FormRow label="名称" htmlFor="name" required>
 *   <Input id="name" ... />
 * </FormRow>
 * ```
 *
 * 通过 CSS 变量 `--form-label-width` 控制 label 列宽（默认 5rem）。
 */
function FormRow({
  label,
  htmlFor,
  required,
  hint,
  divider = true,
  align = 'center',
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  divider?: boolean;
  align?: 'center' | 'start';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[var(--form-label-width,5rem)_1fr] gap-x-3 px-3 py-2',
        align === 'center' ? 'items-center' : 'items-start',
        divider && 'border-b border-border/40',
        className,
      )}
    >
      <label
        htmlFor={htmlFor}
        className={cn(
          'select-none whitespace-nowrap text-right text-sm text-muted-foreground',
          align === 'start' && 'pt-1.5',
        )}
      >
        {label}
        {required && <span className="text-destructive">*</span>}
      </label>
      <div className="min-w-0">
        {children}
        {hint && (
          <p className="mt-1 text-xs text-muted-foreground/70">{hint}</p>
        )}
      </div>
    </div>
  );
}

/**
 * 表单分组标题（用于大表单内的逻辑分段）。
 */
function FormSection({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('py-1', className)}>
      <div className="border-b border-border/40 px-3 py-2">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground/70">
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

export { FormRow, FormSection };
