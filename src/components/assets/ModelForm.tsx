'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ImageUploader } from '@/components/ImageUploader';
import { PhotoFrame } from '@/components/PhotoFrame';
import type { ModelAsset, CreateModelAssetInput } from '@/types/model-asset';
import { Button } from '@/components/ui/button';
import { FormRow, FormSection } from '@/components/ui/form-row';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { getImageUrl } from '@/lib/scene-assets-api';

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

function ReferencePhotoThumb({
  src,
  alt,
  onRemove,
}: {
  src: string;
  alt: string;
  onRemove: () => void;
}) {
  return (
    <PhotoFrame
      src={src}
      alt={alt}
      className="rounded-lg border border-input bg-background"
    >
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </PhotoFrame>
  );
}

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
  const [description, setDescription] = useState(initialData?.description || '');
  const [appearancePrompt, setAppearancePrompt] = useState(
    initialData?.appearancePrompt || '',
  );
  const [primaryImage, setPrimaryImage] = useState(initialData?.primaryImage || '');
  const [referenceImages, setReferenceImages] = useState<string[]>(
    initialData?.referenceImages || [],
  );
  const [tagsInput, setTagsInput] = useState(initialData?.tags?.join(', ') || '');
  const [nameError, setNameError] = useState('');

  const isEditing = !!initialData;

  const handleAddReferenceImage = (path: string) => {
    if (referenceImages.length >= 5) return;
    setReferenceImages([...referenceImages, path]);
  };

  const handleRemoveReferenceImage = (index: number) => {
    setReferenceImages(referenceImages.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setNameError('名称不能为空');
      return;
    }
    setNameError('');

    const tags = tagsInput
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean);

    const data: CreateModelAssetInput = {
      name: name.trim(),
      gender: (gender as 'male' | 'female' | 'other') || undefined,
      ageRangeMin: ageRangeMin ? Number(ageRangeMin) : undefined,
      ageRangeMax: ageRangeMax ? Number(ageRangeMax) : undefined,
      description: description.trim() || undefined,
      appearancePrompt: appearancePrompt.trim() || undefined,
      primaryImage: primaryImage || undefined,
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      tags: tags.length > 0 ? tags : undefined,
    };

    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      {/* 标题栏 */}
      <div className="flex items-center justify-center border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold text-foreground">
          {isEditing ? '编辑模特' : '新建模特'}
        </h2>
      </div>

      {/* 表单内容 */}
      <div className="flex-1 overflow-y-auto" style={{ '--form-label-width': '5.5rem' } as React.CSSProperties}>
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

        <FormRow label="描述" htmlFor="model-desc" align="start">
          <textarea
            id="model-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="关于这个模特的备注信息"
            rows={2}
            className={textareaClass}
          />
        </FormRow>

        <FormRow label="标签" htmlFor="model-tags">
          <input
            id="model-tags"
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="逗号分隔，例如：儿童, 男孩"
            className={inputClass}
          />
        </FormRow>

        {/* 参考照片分组 */}
        <FormSection
          title="参考照片"
          description="上传的照片将作为参考图传给 AI，是保持人物一致性的关键"
        >
          <FormRow label="主参考照" align="start">
            <ImageUploader
              value={primaryImage}
              onChange={(path) => setPrimaryImage(path || '')}
              placeholder="上传主参考照片"
            />
          </FormRow>

          <FormRow label="辅助照片" align="start" hint="最多 5 张">
            <div className="grid grid-cols-5 gap-2">
              {referenceImages.map((img, i) => (
                <ReferencePhotoThumb
                  key={img}
                  src={getImageUrl(img)}
                  alt={`参考照 ${i + 1}`}
                  onRemove={() => handleRemoveReferenceImage(i)}
                />
              ))}
              {referenceImages.length < 5 && (
                <ImageUploader
                  value=""
                  onChange={(path) => {
                    if (path) handleAddReferenceImage(path);
                  }}
                  placeholder=""
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
          hint="描述将注入到出图提示词中，帮助 AI 保持外观一致。建议 20-200 字。"
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
