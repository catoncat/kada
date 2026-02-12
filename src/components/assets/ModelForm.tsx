'use client';

import { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { ImageUploader } from '@/components/ImageUploader';
import type { ModelAsset, CreateModelAssetInput } from '@/types/model-asset';
import { Button } from '@/components/ui/button';
import { getImageUrl } from '@/lib/scene-assets-api';

interface ModelFormProps {
  initialData?: ModelAsset;
  onSubmit: (data: CreateModelAssetInput) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  /** 预填的项目 ID（项目内快速创建时使用） */
  defaultProjectId?: string | null;
}

const GENDER_OPTIONS = [
  { value: '', label: '不限' },
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: 'other', label: '其他' },
];

export function ModelForm({
  initialData,
  onSubmit,
  onCancel,
  loading = false,
  defaultProjectId,
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
      projectId: defaultProjectId ?? initialData?.projectId ?? null,
    };

    await onSubmit(data);
  };

  const inputClass =
    'w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">
          {isEditing ? '编辑模特' : '新建模特'}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="p-2 rounded-lg hover:bg-accent transition"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* 名称 */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2" htmlFor="model-name">
          名称 <span className="text-destructive">*</span>
        </label>
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
          <p className="mt-1 text-sm text-destructive">{nameError}</p>
        )}
      </div>

      {/* 性别 + 年龄范围 */}
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2" htmlFor="model-gender">
            性别
          </label>
          <select
            id="model-gender"
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className={inputClass}
          >
            {GENDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2" htmlFor="model-age-min">
            年龄下限
          </label>
          <input
            id="model-age-min"
            type="number"
            min={0}
            max={120}
            value={ageRangeMin}
            onChange={(e) => setAgeRangeMin(e.target.value)}
            placeholder="例如：3"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2" htmlFor="model-age-max">
            年龄上限
          </label>
          <input
            id="model-age-max"
            type="number"
            min={0}
            max={120}
            value={ageRangeMax}
            onChange={(e) => setAgeRangeMax(e.target.value)}
            placeholder="例如：5"
            className={inputClass}
          />
        </div>
      </div>

      {/* 描述 */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2" htmlFor="model-desc">
          描述
        </label>
        <textarea
          id="model-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="关于这个模特的备注信息"
          rows={2}
          className={`${inputClass} resize-none`}
        />
      </div>

      {/* 参考照片 */}
      <div className="rounded-xl border border-border bg-muted/60 p-4">
        <h3 className="text-sm font-medium text-foreground mb-4">参考照片</h3>
        <p className="text-xs text-muted-foreground mb-3">
          上传的照片将作为参考图传给 AI，是保持人物一致性的关键
        </p>

        {/* 主参考照 */}
        <div className="mb-4">
          <div className="block text-xs text-muted-foreground mb-2">主参考照</div>
          <ImageUploader
            value={primaryImage}
            onChange={(path) => setPrimaryImage(path || '')}
            placeholder="上传主参考照片"
          />
        </div>

        {/* 辅助参考照 */}
        <div>
          <div className="block text-xs text-muted-foreground mb-2">
            辅助参考照（最多 5 张）
          </div>
          <div className="grid grid-cols-5 gap-2">
            {referenceImages.map((img, i) => (
              <div key={img} className="relative aspect-square rounded-lg overflow-hidden bg-background border border-input">
                <img
                  src={getImageUrl(img)}
                  alt={`参考照 ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveReferenceImage(i)}
                  className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
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
        </div>
      </div>

      {/* 外观提示词 */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2" htmlFor="model-appearance">
          外观提示词
        </label>
        <textarea
          id="model-appearance"
          value={appearancePrompt}
          onChange={(e) => setAppearancePrompt(e.target.value)}
          placeholder="描述人物的外貌特征，如肤色、发型、体型、五官等"
          rows={4}
          className={`${inputClass} resize-none`}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          此描述将注入到出图提示词中，帮助 AI 保持人物外观一致。建议 20-200 字。
        </p>
      </div>

      {/* 标签 */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2" htmlFor="model-tags">
          标签
        </label>
        <input
          id="model-tags"
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="用逗号分隔，例如：儿童, 男孩, 活泼"
          className={inputClass}
        />
      </div>

      {/* 提交按钮 */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        <Button onClick={onCancel} disabled={loading} variant="outline">
          取消
        </Button>
        <Button type="submit" disabled={loading || !name.trim()}>
          {loading ? '保存中...' : isEditing ? '保存修改' : '创建模特'}
        </Button>
      </div>
    </form>
  );
}
