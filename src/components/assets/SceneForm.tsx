'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { ImageUploader } from '@/components/ImageUploader';
import type { SceneAsset, CreateSceneAssetInput, SceneStyle } from '@/types/scene-asset';

interface SceneFormProps {
  /** 编辑时的初始数据 */
  initialData?: SceneAsset;
  /** 提交回调 */
  onSubmit: (data: CreateSceneAssetInput) => Promise<void>;
  /** 取消回调 */
  onCancel: () => void;
  /** 是否正在提交 */
  loading?: boolean;
}

const COLOR_TONE_OPTIONS: { value: SceneStyle['colorTone']; label: string }[] = [
  { value: 'warm', label: '暖色调' },
  { value: 'cool', label: '冷色调' },
  { value: 'neutral', label: '中性' },
];

const LIGHTING_MOOD_OPTIONS: { value: SceneStyle['lightingMood']; label: string }[] = [
  { value: 'soft', label: '柔光' },
  { value: 'dramatic', label: '戏剧性' },
  { value: 'natural', label: '自然光' },
];

const ERA_OPTIONS: { value: SceneStyle['era']; label: string }[] = [
  { value: 'modern', label: '现代' },
  { value: 'vintage', label: '复古' },
  { value: 'timeless', label: '经典' },
];

export function SceneForm({ initialData, onSubmit, onCancel, loading = false }: SceneFormProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [primaryImage, setPrimaryImage] = useState(initialData?.primaryImage || '');
  const [defaultLighting, setDefaultLighting] = useState(initialData?.defaultLighting || '');
  const [isOutdoor, setIsOutdoor] = useState(initialData?.isOutdoor || false);
  const [tagsInput, setTagsInput] = useState(initialData?.tags?.join(', ') || '');

  // 风格属性
  const [colorTone, setColorTone] = useState<SceneStyle['colorTone']>(
    initialData?.style?.colorTone || 'neutral'
  );
  const [lightingMood, setLightingMood] = useState<SceneStyle['lightingMood']>(
    initialData?.style?.lightingMood || 'natural'
  );
  const [era, setEra] = useState<SceneStyle['era']>(initialData?.style?.era || 'timeless');

  const isEditing = !!initialData;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert('请输入场景名称');
      return;
    }

    const tags = tagsInput
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean);

    const data: CreateSceneAssetInput = {
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

    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between pb-4 border-b border-[var(--line)]">
        <h2 className="text-lg font-semibold text-[var(--ink)]">
          {isEditing ? '编辑场景' : '新建场景'}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="p-2 rounded-lg hover:bg-[var(--paper-2)] transition"
        >
          <X className="w-5 h-5 text-[var(--ink-2)]" />
        </button>
      </div>

      {/* 主图上传 */}
      <div>
        <label className="block text-sm font-medium text-[var(--ink)] mb-2">
          场景主图
        </label>
        <ImageUploader
          value={primaryImage}
          onChange={(path) => setPrimaryImage(path || '')}
          placeholder="上传场景照片"
        />
      </div>

      {/* 基本信息 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-[var(--ink)] mb-2">
            场景名称 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：白墙区、窗光区、户外草坪"
            className="w-full rounded-lg border border-[var(--line)] bg-white px-4 py-2.5 text-sm text-[var(--ink)] placeholder-[var(--ink-3)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--ink)] mb-2">
            默认灯光
          </label>
          <input
            type="text"
            value={defaultLighting}
            onChange={(e) => setDefaultLighting(e.target.value)}
            placeholder="例如：蝴蝶光、环形灯、自然光"
            className="w-full rounded-lg border border-[var(--line)] bg-white px-4 py-2.5 text-sm text-[var(--ink)] placeholder-[var(--ink-3)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          />
        </div>
      </div>

      {/* 描述 */}
      <div>
        <label className="block text-sm font-medium text-[var(--ink)] mb-2">
          场景描述
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="描述这个场景的特点、适合的拍摄风格等"
          rows={3}
          className="w-full rounded-lg border border-[var(--line)] bg-white px-4 py-2.5 text-sm text-[var(--ink)] placeholder-[var(--ink-3)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] resize-none"
        />
      </div>

      {/* 标签 */}
      <div>
        <label className="block text-sm font-medium text-[var(--ink)] mb-2">
          标签
        </label>
        <input
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="用逗号分隔，例如：极简, 高调, 现代"
          className="w-full rounded-lg border border-[var(--line)] bg-white px-4 py-2.5 text-sm text-[var(--ink)] placeholder-[var(--ink-3)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
        />
      </div>

      {/* 户外标记 */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="isOutdoor"
          checked={isOutdoor}
          onChange={(e) => setIsOutdoor(e.target.checked)}
          className="w-4 h-4 rounded border-[var(--line)] text-[var(--primary)] focus:ring-[var(--primary)]"
        />
        <label htmlFor="isOutdoor" className="text-sm text-[var(--ink)]">
          这是户外场景
        </label>
      </div>

      {/* 风格属性 */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-4">
        <h3 className="text-sm font-medium text-[var(--ink)] mb-4">风格属性</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {/* 色调 */}
          <div>
            <label className="block text-xs text-[var(--ink-2)] mb-2">色调</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_TONE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setColorTone(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    colorTone === opt.value
                      ? 'bg-[var(--primary)] text-white'
                      : 'bg-white border border-[var(--line)] text-[var(--ink-2)] hover:border-[var(--ink-3)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 光线氛围 */}
          <div>
            <label className="block text-xs text-[var(--ink-2)] mb-2">光线氛围</label>
            <div className="flex flex-wrap gap-2">
              {LIGHTING_MOOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setLightingMood(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    lightingMood === opt.value
                      ? 'bg-[var(--primary)] text-white'
                      : 'bg-white border border-[var(--line)] text-[var(--ink-2)] hover:border-[var(--ink-3)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 年代感 */}
          <div>
            <label className="block text-xs text-[var(--ink-2)] mb-2">年代感</label>
            <div className="flex flex-wrap gap-2">
              {ERA_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setEra(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    era === opt.value
                      ? 'bg-[var(--primary)] text-white'
                      : 'bg-white border border-[var(--line)] text-[var(--ink-2)] hover:border-[var(--ink-3)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 提交按钮 */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--line)]">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--paper-2)] transition"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="px-6 py-2 rounded-lg text-sm font-medium bg-[var(--primary)] text-white hover:opacity-90 transition disabled:opacity-50"
        >
          {loading ? '保存中...' : isEditing ? '保存修改' : '创建场景'}
        </button>
      </div>
    </form>
  );
}
