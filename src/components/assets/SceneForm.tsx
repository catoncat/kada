'use client';

import { useMemo, useState } from 'react';
import { MapPin, Sun, Tag, X } from 'lucide-react';
import { ImageUploader } from '@/components/ImageUploader';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import type {
  CreateSceneAssetInput,
  SceneAsset,
  SceneStyle,
} from '@/types/scene-asset';

interface SceneFormProps {
  initialData?: SceneAsset;
  onSubmit: (data: CreateSceneAssetInput) => Promise<void>;
  onCancel?: () => void;
  onDelete?: () => void;
  loading?: boolean;
}

const COLOR_TONE_OPTIONS = [
  { value: 'warm', label: '暖色调' },
  { value: 'cool', label: '冷色调' },
  { value: 'neutral', label: '中性' },
] as const;

const LIGHTING_MOOD_OPTIONS = [
  { value: 'soft', label: '柔光' },
  { value: 'dramatic', label: '戏剧性' },
  { value: 'natural', label: '自然光' },
] as const;

const ERA_OPTIONS = [
  { value: 'modern', label: '现代' },
  { value: 'vintage', label: '复古' },
  { value: 'timeless', label: '经典' },
] as const;

const fieldCls =
  'h-8 w-full rounded-lg border border-transparent bg-background/92 px-2.5 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_0_0_1px_rgba(60,60,67,0.12)] transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#007AFF]/28 focus-visible:shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_0_0_1px_rgba(0,122,255,0.35)] dark:bg-background/75 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_1px_rgba(255,255,255,0.12)] dark:focus-visible:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_0_1px_rgba(10,132,255,0.55)] placeholder:text-muted-foreground/70';

const textareaCls =
  'w-full rounded-lg border border-transparent bg-background/92 px-3 py-2 text-sm text-foreground leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_0_0_1px_rgba(60,60,67,0.12)] transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#007AFF]/28 focus-visible:shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_0_0_1px_rgba(0,122,255,0.35)] dark:bg-background/75 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_1px_rgba(255,255,255,0.12)] dark:focus-visible:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_0_1px_rgba(10,132,255,0.55)] placeholder:text-muted-foreground/70 resize-none';

const macImageUploaderCls =
  '[&>button]:rounded-xl [&>button]:border [&>button]:border-input/70 [&>button]:border-solid [&>button]:bg-muted/35 [&>button]:p-6 [&>button]:hover:bg-muted/55 [&>button]:transition-colors';

export function SceneForm({
  initialData,
  onSubmit,
  onCancel,
  onDelete,
  loading = false,
}: SceneFormProps) {
  const isCreate = !initialData;

  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [primaryImage, setPrimaryImage] = useState(initialData?.primaryImage || '');
  const [defaultLighting, setDefaultLighting] = useState(
    initialData?.defaultLighting || '',
  );
  const [isOutdoor, setIsOutdoor] = useState(initialData?.isOutdoor || false);
  const [tagsInput, setTagsInput] = useState(initialData?.tags?.join(', ') || '');

  const [colorTone, setColorTone] = useState<SceneStyle['colorTone']>(
    initialData?.style?.colorTone || 'neutral',
  );
  const [lightingMood, setLightingMood] = useState<SceneStyle['lightingMood']>(
    initialData?.style?.lightingMood || 'natural',
  );
  const [era, setEra] = useState<SceneStyle['era']>(
    initialData?.style?.era || 'timeless',
  );
  const [nameError, setNameError] = useState('');

  const isDirty = useMemo(() => {
    if (isCreate) {
      return Boolean(
        name.trim() ||
          description.trim() ||
          primaryImage ||
          defaultLighting.trim() ||
          tagsInput.trim() ||
          isOutdoor,
      );
    }

    return (
      name !== (initialData.name || '') ||
      description !== (initialData.description || '') ||
      primaryImage !== (initialData.primaryImage || '') ||
      defaultLighting !== (initialData.defaultLighting || '') ||
      isOutdoor !== Boolean(initialData.isOutdoor) ||
      tagsInput !== (initialData.tags?.join(', ') || '') ||
      colorTone !== (initialData.style?.colorTone || 'neutral') ||
      lightingMood !== (initialData.style?.lightingMood || 'natural') ||
      era !== (initialData.style?.era || 'timeless')
    );
  }, [
    colorTone,
    defaultLighting,
    description,
    era,
    initialData,
    isCreate,
    isOutdoor,
    lightingMood,
    name,
    primaryImage,
    tagsInput,
  ]);

  const resetToInitial = () => {
    setName(initialData?.name || '');
    setDescription(initialData?.description || '');
    setPrimaryImage(initialData?.primaryImage || '');
    setDefaultLighting(initialData?.defaultLighting || '');
    setIsOutdoor(Boolean(initialData?.isOutdoor));
    setTagsInput(initialData?.tags?.join(', ') || '');
    setColorTone(initialData?.style?.colorTone || 'neutral');
    setLightingMood(initialData?.style?.lightingMood || 'natural');
    setEra(initialData?.style?.era || 'timeless');
    setNameError('');
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setNameError('场景名称不能为空');
      return;
    }

    setNameError('');

    const tags = tagsInput
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean);

    const payload: CreateSceneAssetInput = {
      name: name.trim(),
      description: description.trim() || undefined,
      primaryImage: primaryImage || undefined,
      defaultLighting: defaultLighting.trim() || undefined,
      isOutdoor,
      tags: tags.length > 0 ? tags : undefined,
      style: {
        colorTone,
        lightingMood,
        era,
      },
    };

    await onSubmit(payload);
  };

  return (
    <div className="flex h-full flex-col">
      {isCreate && (
        <div className="flex items-center justify-between border-b px-6 py-3.5">
          <h2 className="text-base font-semibold">新场景</h2>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md p-1.5 transition hover:bg-accent"
              aria-label="关闭"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-2xl space-y-6 px-6 py-6">
          <div className="rounded-xl border border-border/70 bg-card px-5 py-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.28)]">
            <div className="flex gap-5">
              <div className="w-32 shrink-0">
                <ImageUploader
                  value={primaryImage}
                  onChange={(path) => setPrimaryImage(path || '')}
                  placeholder="场景主图"
                  className={macImageUploaderCls}
                />
              </div>

              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (nameError) setNameError('');
                    }}
                    placeholder="场景名称"
                    className="h-10 w-full rounded-lg border border-transparent bg-background/92 px-3 text-[1.1rem] font-semibold tracking-[-0.01em] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_0_0_1px_rgba(60,60,67,0.12)] transition placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#007AFF]/28 focus-visible:shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_0_0_1px_rgba(0,122,255,0.35)] dark:bg-background/75 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_1px_rgba(255,255,255,0.12)]"
                  />
                  {nameError && (
                    <p className="mt-1 text-xs text-destructive">{nameError}</p>
                  )}
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Sun className="h-3 w-3" />
                      默认灯光
                    </span>
                    <input
                      type="text"
                      value={defaultLighting}
                      onChange={(e) => setDefaultLighting(e.target.value)}
                      placeholder="例如：自然窗光"
                      className={fieldCls}
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Tag className="h-3 w-3" />
                      标签
                    </span>
                    <input
                      type="text"
                      value={tagsInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                      placeholder="逗号分隔"
                      className={fieldCls}
                    />
                  </label>
                </div>

                <label className="inline-flex w-fit items-center gap-2 rounded-lg border border-input/70 bg-background/75 px-2.5 py-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={isOutdoor}
                    onChange={(e) => setIsOutdoor(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    户外场景
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-card px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.28)]">
            <label
              htmlFor="scene-description"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              场景描述
            </label>
            <textarea
              id="scene-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="描述这个场景的特点、适合的拍摄风格等"
              rows={3}
              className={textareaCls}
            />
          </div>

          <div className="rounded-xl border border-border/70 bg-card px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.28)]">
            <div className="mb-3 text-sm font-medium text-foreground">风格属性</div>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="mb-1.5 text-xs text-muted-foreground">色调</div>
                <SegmentedControl
                  value={colorTone || ''}
                  onValueChange={(v) => setColorTone((v || 'neutral') as SceneStyle['colorTone'])}
                  options={COLOR_TONE_OPTIONS as unknown as { value: string; label: string }[]}
                  size="sm"
                />
              </div>

              <div>
                <div className="mb-1.5 text-xs text-muted-foreground">光线氛围</div>
                <SegmentedControl
                  value={lightingMood || ''}
                  onValueChange={(v) =>
                    setLightingMood((v || 'natural') as SceneStyle['lightingMood'])
                  }
                  options={LIGHTING_MOOD_OPTIONS as unknown as { value: string; label: string }[]}
                  size="sm"
                />
              </div>

              <div>
                <div className="mb-1.5 text-xs text-muted-foreground">年代感</div>
                <SegmentedControl
                  value={era || ''}
                  onValueChange={(v) => setEra((v || 'timeless') as SceneStyle['era'])}
                  options={ERA_OPTIONS as unknown as { value: string; label: string }[]}
                  size="sm"
                />
              </div>
            </div>
          </div>

          {!isCreate && onDelete && (
            <div className="border-t border-border/60 pt-4">
              <button
                type="button"
                onClick={onDelete}
                className="text-sm text-destructive/70 transition hover:text-destructive"
              >
                删除此场景...
              </button>
            </div>
          )}
        </div>
      </div>

      {isCreate ? (
        <div className="flex items-center justify-end gap-2 border-t bg-background px-6 py-3">
          {onCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={loading}
            >
              取消
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={loading || !name.trim()}
          >
            {loading ? '创建中...' : '创建'}
          </Button>
        </div>
      ) : isDirty ? (
        <div className="flex items-center justify-between border-t bg-background/80 px-6 py-3 backdrop-blur-sm">
          <span className="text-sm text-muted-foreground">有未保存的修改</span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={resetToInitial}
              disabled={loading}
            >
              放弃修改
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={loading || !name.trim()}
            >
              {loading ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
