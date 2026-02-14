'use client';

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "[&_svg]:-mx-0.5 relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border text-sm font-medium leading-none outline-none transition-[background-color,color,border-color] pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-60 [&_svg:not([class*='opacity-'])]:opacity-85 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        default: 'h-[var(--control-h)] px-[calc(--spacing(3)-1px)]',
        icon: 'size-[var(--control-h)]',
        'icon-lg':
          "size-[var(--control-h-lg)] [&_svg:not([class*='size-'])]:size-4.5",
        'icon-sm':
          "size-[var(--control-h-sm)] [&_svg:not([class*='size-'])]:size-3.5",
        'icon-xl': "size-8 [&_svg:not([class*='size-'])]:size-5",
        'icon-xs':
          "size-6 rounded-sm not-in-data-[slot=input-group]:[&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-[var(--control-h-lg)] px-[calc(--spacing(3.5)-1px)]',
        sm: 'h-[var(--control-h-sm)] gap-1 px-[calc(--spacing(2.5)-1px)] text-xs',
        xl: "h-8 px-[calc(--spacing(4)-1px)] text-base [&_svg:not([class*='size-'])]:size-5",
        xs: "h-6 gap-1 rounded-sm px-[calc(--spacing(2)-1px)] text-xs [&_svg:not([class*='size-'])]:size-3.5",
      },
      variant: {
        default:
          'border-primary bg-primary text-primary-foreground [:hover,[data-pressed]]:bg-primary/92 [:active,[data-pressed]]:bg-primary/82',
        destructive:
          'border-destructive bg-destructive text-white [:hover,[data-pressed]]:bg-destructive/92 [:active,[data-pressed]]:bg-destructive/82',
        'destructive-outline':
          'border-input bg-background/80 text-destructive-foreground [:hover,[data-pressed]]:border-destructive/40 [:hover,[data-pressed]]:bg-destructive/8',
        ghost:
          'border-transparent text-foreground data-pressed:bg-muted/90 [:hover,[data-pressed]]:bg-muted/85',
        link: 'border-transparent underline-offset-4 [:hover,[data-pressed]]:underline',
        outline:
          'border-input bg-background/80 text-foreground [:hover,[data-pressed]]:bg-muted/82',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground [:active,[data-pressed]]:bg-secondary/78 [:hover,[data-pressed]]:bg-secondary/90',
      },
    },
  },
);

interface ButtonProps extends useRender.ComponentProps<'button'> {
  variant?: VariantProps<typeof buttonVariants>['variant'];
  size?: VariantProps<typeof buttonVariants>['size'];
}

function Button({ className, variant, size, render, ...props }: ButtonProps) {
  const typeValue: React.ButtonHTMLAttributes<HTMLButtonElement>['type'] =
    render ? undefined : 'button';

  const defaultProps = {
    className: cn(buttonVariants({ className, size, variant })),
    'data-slot': 'button',
    type: typeValue,
  };

  return useRender({
    defaultTagName: 'button',
    props: mergeProps<'button'>(defaultProps, props),
    render,
  });
}

export { Button, buttonVariants };
