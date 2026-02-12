import type { ImgHTMLAttributes, ReactNode } from 'react';
import {
  PHOTO_RATIO_CLASS,
  type PhotoOrientation,
  usePhotoOrientation,
} from '@/hooks/usePhotoOrientation';
import { cn } from '@/lib/utils';

interface PhotoFrameProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'className'> {
  src?: string | null;
  alt: string;
  className?: string;
  imgClassName?: string;
  fallback?: ReactNode;
  fallbackClassName?: string;
  children?: ReactNode;
  defaultOrientation?: PhotoOrientation;
  forcedOrientation?: PhotoOrientation;
}

export function PhotoFrame({
  src,
  alt,
  className,
  imgClassName,
  fallback,
  fallbackClassName,
  children,
  defaultOrientation = 'landscape',
  forcedOrientation,
  ...imgProps
}: PhotoFrameProps) {
  const normalizedSrc = typeof src === 'string' ? src.trim() : '';
  const hasImage = normalizedSrc.length > 0;
  const { ratioClass } = usePhotoOrientation(
    forcedOrientation ? null : normalizedSrc,
    { fallback: defaultOrientation },
  );

  const appliedRatioClass = forcedOrientation
    ? PHOTO_RATIO_CLASS[forcedOrientation]
    : ratioClass;

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-muted',
        appliedRatioClass,
        className,
      )}
    >
      {hasImage ? (
        <img
          {...imgProps}
          src={normalizedSrc}
          alt={alt}
          className={cn('h-full w-full object-cover', imgClassName)}
        />
      ) : fallback ? (
        <div className={cn('absolute inset-0', fallbackClassName)}>
          {fallback}
        </div>
      ) : null}
      {children}
    </div>
  );
}
