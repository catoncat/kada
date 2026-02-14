'use client';

import { useState } from 'react';
import { ImageUploader } from '@/components/ImageUploader';
import { Button } from '@/components/ui/button';
import { FormRow, FormSection } from '@/components/ui/form-row';
import { SegmentedControl } from '@/components/ui/segmented-control';
import type { CreateModelAssetInput, ModelAsset } from '@/types/model-asset';

interface ModelFormProps {
  initialData?: ModelAsset;
  onSubmit: (data: CreateModelAssetInput) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

const GENDER_OPTIONS = [
  { value: 'male' as const, label: '男' },
  { value: 'female' as const, label: '女' },
];

const inputClass =
  'w-full h-7 rounded-md border border-input bg-background px-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

const textareaClass =
  'w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 resize-none';

export function ModelForm({
  initialData,
  onSubmit,
  onCancel,
  loading = false,
}: ModelFormProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [gender, setGender] = useState(initialData?.gender || '');
  const [ageRangeMin, setAgeRangeMin] = useState<string>(
    initialData?.ageRangeMin != null ? String(initialData.ageRangeMin) : '',
  );
  const [ageRangeMax, setAgeRangeMax] = useState<string>(
    initialData?.ageRangeMax != null ? String(initialData.ageRangeMax) : '',
  );
  const [appearancePrompt, setAppearancePrompt] = useState(
    initialData?.appearancePrompt || '',
  );
  const [primaryImage, setPrimaryImage] = useState(
    initialData?.primaryImage || '',
  );
  const [referenceImages, setReferenceImages] = useState<string[]>(
    initialData?.referenceImages || [],
  );
  const [nameError, setNameError] = useState('');

  const isEditing = !!initialData;

  const handleAddReferenceImage = (path: string) => {
    if (referenceImages.length >= 5) return;
    setReferenceImages([...referenceImages, path]);
  };

  const handleRemoveReferenceImage = (index: number) => {
    setReferenceImages(referenceImages.filter((_, i) => i !== index));
  };

  const handleReplaceReferenceImage = (index: number, path: string) => {
    setReferenceImages(
      referenceImages.map((img, i) => (i === index ? path : img)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setNameError('名称不能为空');
      return;
    }
    setNameError('');

    const data: CreateModelAssetInput = {
      name: name.trim(),
      gender: (gender as 'male' | 'female' | 'other') || undefined,
      ageRangeMin: ageRangeMin ? Number(ageRangeMin) : undefined,
      ageRangeMax: ageRangeMax ? Number(ageRangeMax) : undefined,
      appearancePrompt: appearancePrompt.trim() || undefined,
      primaryImage: primaryImage || undefined,
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
    };

    await onSubmit(data);
  };

  const getReferenceRenderKey = (() => {
    const seen = new Map<string, number>();
    return (path: string) => {
      const count = (seen.get(path) ?? 0) + 1;
      seen.set(path, count);
      return `${path}::${count}`;
    };
  })();

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      {/* 标题栏 */}
      <div className="flex items-center justify-center border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold text-foreground">
          {isEditing ? '编辑模特' : '新建模特'}
        </h2>
      </div>

      {/* 表单内容 */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ '--form-label-width': '5rem' } as React.CSSProperties}
      >
        {/* 基本信息 */}
        <FormRow label="名称" htmlFor="model-name" required>
          <input
            id="model-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError('');
            }}
            placeholder="例如：小明、模特A"
            className={inputClass}
            required
          />
          {nameError && (
            <p className="mt-1 text-xs text-destructive">{nameError}</p>
          )}
        </FormRow>

        <FormRow label="性别">
          <SegmentedControl
            value={gender as 'male' | 'female' | ''}
            onValueChange={(v) => setGender(v)}
            options={GENDER_OPTIONS}
            size="sm"
            allowDeselect
          />
        </FormRow>

        <FormRow label="年龄范围">
          <div className="flex items-center gap-2">
            <input
              id="model-age-min"
              type="number"
              min={0}
              max={120}
              value={ageRangeMin}
              onChange={(e) => setAgeRangeMin(e.target.value)}
              placeholder="下限"
              className={`${inputClass} w-20`}
            />
            <span className="text-xs text-muted-foreground">—</span>
            <input
              id="model-age-max"
              type="number"
              min={0}
              max={120}
              value={ageRangeMax}
              onChange={(e) => setAgeRangeMax(e.target.value)}
              placeholder="上限"
              className={`${inputClass} w-20`}
            />
          </div>
        </FormRow>

        {/* 参考照片分组 */}
        <FormSection title="参考照片">
          <FormRow label="主参考照" align="start">
            <ImageUploader
              value={primaryImage}
              onChange={(path) => setPrimaryImage(path || '')}
              placeholder="上传主照片"
              emptyOrientation="portrait"
              metaText={false}
            />
          </FormRow>

          <FormRow label="辅助照片" align="start">
            <div className="grid grid-cols-3 items-start gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {referenceImages.map((img, i) => (
                <ImageUploader
                  key={getReferenceRenderKey(img)}
                  value={img}
                  onChange={(path) => {
                    if (path) {
                      handleReplaceReferenceImage(i, path);
                    } else {
                      handleRemoveReferenceImage(i);
                    }
                  }}
                  placeholder="参考图"
                  compact
                  emptyOrientation="portrait"
                  metaText={false}
                />
              ))}
              {referenceImages.length < 5 && (
                <ImageUploader
                  value=""
                  onChange={(path) => {
                    if (path) handleAddReferenceImage(path);
                  }}
                  placeholder="添加参考图"
                  compact
                  emptyOrientation="portrait"
                  metaText={false}
                />
              )}
            </div>
          </FormRow>
        </FormSection>

        {/* 外观提示词 */}
        <FormRow
          label="外观提示词"
          htmlFor="model-appearance"
          align="start"
          divider={false}
        >
          <textarea
            id="model-appearance"
            value={appearancePrompt}
            onChange={(e) => setAppearancePrompt(e.target.value)}
            placeholder="描述人物的外貌特征，如肤色、发型、体型、五官等"
            rows={3}
            className={textareaClass}
          />
        </FormRow>
      </div>

      {/* 底部操作栏 */}
      <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2.5">
        <Button
          onClick={onCancel}
          disabled={loading}
          variant="outline"
          size="sm"
          className="text-sm"
        >
          取消
        </Button>
        <Button
          type="submit"
          disabled={loading || !name.trim()}
          size="sm"
          className="text-sm"
        >
          {loading ? '保存中...' : isEditing ? '保存修改' : '创建'}
        </Button>
      </div>
    </form>
  );
}
