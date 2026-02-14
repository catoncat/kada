'use client';

import { Input as InputPrimitive } from '@base-ui/react/input';
import type * as React from 'react';

import { cn } from '@/lib/utils';

type InputProps = Omit<
  InputPrimitive.Props & React.RefAttributes<HTMLInputElement>,
  'size'
> & {
  size?: 'sm' | 'default' | 'lg' | number;
  unstyled?: boolean;
  nativeInput?: boolean;
};

function Input({
  className,
  size = 'default',
  unstyled = false,
  nativeInput = false,
  ...props
}: InputProps) {
  const inputClassName = cn(
    'h-[var(--control-h)] w-full min-w-0 rounded-[inherit] px-[calc(--spacing(3)-1px)] text-sm leading-none outline-none placeholder:text-muted-foreground/72 [transition:background-color_5000000s_ease-in-out_0s]',
    size === 'sm' &&
      'h-[var(--control-h-sm)] px-[calc(--spacing(2.5)-1px)] text-xs',
    size === 'lg' && 'h-[var(--control-h-lg)]',
    props.type === 'search' &&
      '[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none',
    props.type === 'file' &&
      'text-muted-foreground file:me-3 file:bg-transparent file:font-medium file:text-foreground file:text-sm',
  );

  return (
    <span
      className={
        cn(
          !unstyled &&
            'relative inline-flex w-full rounded-md border border-input bg-background/78 text-foreground ring-ring/30 transition-[border-color,box-shadow,background-color] has-focus-visible:border-ring has-focus-visible:ring-2 has-focus-visible:ring-ring/24 has-focus-visible:has-aria-invalid:border-destructive/64 has-focus-visible:has-aria-invalid:ring-destructive/22 has-aria-invalid:border-destructive/42 has-autofill:bg-foreground/4 has-disabled:opacity-64 dark:bg-input/22 dark:has-autofill:bg-foreground/8',
          className,
        ) || undefined
      }
      data-size={size}
      data-slot="input-control"
    >
      {nativeInput ? (
        <input
          className={inputClassName}
          data-slot="input"
          size={typeof size === 'number' ? size : undefined}
          {...props}
        />
      ) : (
        <InputPrimitive
          className={inputClassName}
          data-slot="input"
          size={typeof size === 'number' ? size : undefined}
          {...props}
        />
      )}
    </span>
  );
}

export { Input, type InputProps };
