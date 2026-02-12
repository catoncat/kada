import { useEffect, useState } from 'react';

export type PhotoOrientation = 'landscape' | 'portrait';

export const PHOTO_RATIO_CLASS: Record<PhotoOrientation, string> = {
  landscape: 'aspect-[3/2]',
  portrait: 'aspect-[2/3]',
};

function detectOrientation(width: number, height: number): PhotoOrientation {
  return height > width ? 'portrait' : 'landscape';
}

export function usePhotoOrientation(
  imageUrl?: string | null,
  options?: { fallback?: PhotoOrientation },
) {
  const fallback = options?.fallback ?? 'landscape';
  const [orientation, setOrientation] = useState<PhotoOrientation>(fallback);

  useEffect(() => {
    if (!imageUrl) {
      setOrientation(fallback);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setOrientation(detectOrientation(img.naturalWidth, img.naturalHeight));
    };
    img.onerror = () => {
      if (cancelled) return;
      setOrientation(fallback);
    };
    img.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [imageUrl, fallback]);

  return {
    orientation,
    ratioClass: PHOTO_RATIO_CLASS[orientation],
  };
}
