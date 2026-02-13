'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Plus, Search, Trash2, User, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ImageUploader } from '@/components/ImageUploader';
import { PhotoFrame } from '@/components/PhotoFrame';
import {
  ThreeColumnDetailPane,
  ThreeColumnLayout,
  ThreeColumnListPane,
} from '@/components/layout/ThreeColumnLayout';
import { THREE_COLUMN_PRESETS } from '@/components/layout/three-column-presets';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  createModelAsset,
  deleteModelAsset,
  getModelAssets,
  updateModelAsset,
} from '@/lib/model-assets-api';
import { getImageUrl } from '@/lib/scene-assets-api';
import { cn } from '@/lib/utils';
import type { CreateModelAssetInput, ModelAsset } from '@/types/model-asset';

interface ModelsSearchParams {
  action?: 'create';
  modelId?: string;
}

export const Route = createFileRoute('/assets/models')({
  component: ModelsAssetPage,
  validateSearch: (search: Record<string, unknown>): ModelsSearchParams => ({
    action: search.action === 'create' ? 'create' : undefined,
    modelId:
      typeof search.modelId === 'string' && search.modelId.trim()
        ? search.modelId
        : undefined,
  }),
});

const GENDER_LABELS: Record<string, string> = {
  male: '男',
  female: '女',
  other: '其他',
};

type PanelMode = 'empty' | 'detail' | 'create';

function ModelsAssetPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { action, modelId: searchModelId } = Route.useSearch();
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>('empty');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ModelAsset | null>(null);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    let shouldClearSearch = false;

    if (action === 'create') {
      setSelectedModelId(null);
      setPanelMode('create');
      shouldClearSearch = true;
    }

    if (searchModelId) {
      setSelectedModelId(searchModelId);
      setPanelMode('detail');
      shouldClearSearch = true;
    }

    if (shouldClearSearch) {
      navigate({ to: '/assets/models', search: {}, replace: true });
    }
  }, [action, navigate, searchModelId]);

  const { data, isLoading } = useQuery({
    queryKey: ['modelAssets'],
    queryFn: () => getModelAssets(),
  });

  const models = data?.data || [];

  const filteredModels = useMemo(() => {
    if (!search.trim()) return models;
    const q = search.toLowerCase();
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.appearancePrompt?.toLowerCase().includes(q) ||
        m.tags?.some((t) => t.toLowerCase().includes(q)),
    );
  }, [models, search]);

  const selectedModel = models.find((m) => m.id === selectedModelId) ?? null;

  // 创建
  const createMutation = useMutation({
    mutationFn: createModelAsset,
    onSuccess: (newModel) => {
      queryClient.invalidateQueries({ queryKey: ['modelAssets'] });
      setSelectedModelId(newModel.id);
      setPanelMode('detail');
    },
  });

  // 更新：等 refetch 完成后再 remount 面板
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateModelAssetInput }) =>
      updateModelAsset(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['modelAssets'] });
      setResetKey((k) => k + 1);
    },
  });

  // 删除
  const deleteMutation = useMutation({
    mutationFn: deleteModelAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modelAssets'] });
      if (deleteTarget?.id === selectedModelId) {
        setSelectedModelId(null);
        setPanelMode('empty');
      }
      setDeleteTarget(null);
    },
  });

  const handleCreate = () => {
    setSelectedModelId(null);
    setPanelMode('create');
  };

  const handleSelect = (id: string) => {
    setSelectedModelId(id);
    setPanelMode('detail');
  };

  const handleSubmitCreate = async (data: CreateModelAssetInput) => {
    await createMutation.mutateAsync(data);
  };

  const handleSubmitEdit = async (data: CreateModelAssetInput) => {
    if (!selectedModelId) return;
    await updateMutation.mutateAsync({ id: selectedModelId, data });
  };

  const handleDelete = (model: ModelAsset) => {
    setDeleteTarget(model);
  };

  const listPanel = (
    <ThreeColumnListPane>
      <div className="p-3">
        <Button
          onClick={handleCreate}
          className="w-full justify-center"
          size="sm"
          variant="outline"
        >
          <Plus className="w-4 h-4" />
          新建模特
        </Button>
      </div>

      {models.length > 0 && (
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="搜索模特..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 bg-muted/50"
              size="sm"
            />
          </div>
        </div>
      )}

      {models.length > 0 && <div className="mx-3 border-t" />}

      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
        onWheel={(e) => e.stopPropagation()}
      >
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && models.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            还没有模特
          </div>
        )}

        {!isLoading && models.length > 0 && filteredModels.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            没有匹配的模特
          </div>
        )}

        {!isLoading && filteredModels.length > 0 && (
          <div className="px-2 py-1">
            {filteredModels.map((model) => (
              <ModelListItem
                key={model.id}
                model={model}
                selected={model.id === selectedModelId}
                onSelect={() => handleSelect(model.id)}
                onDelete={() => handleDelete(model)}
              />
            ))}
          </div>
        )}
      </div>
    </ThreeColumnListPane>
  );

  const detailPanel = (
    <ThreeColumnDetailPane>
      {panelMode === 'empty' && (
        <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
          <Users className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-sm">选择一个模特查看详情</p>
          <p className="text-xs mt-1 opacity-60">或点击「新建模特」创建</p>
        </div>
      )}

      {panelMode === 'create' && (
        <ModelPropertyPanel
          key="__create__"
          model={null}
          onSave={handleSubmitCreate}
          onCancel={() => setPanelMode(selectedModelId ? 'detail' : 'empty')}
          loading={createMutation.isPending}
        />
      )}

      {panelMode === 'detail' && selectedModel && (
        <ModelPropertyPanel
          key={`${selectedModel.id}:${resetKey}`}
          model={selectedModel}
          onSave={handleSubmitEdit}
          onDelete={() => handleDelete(selectedModel)}
          loading={updateMutation.isPending}
        />
      )}
    </ThreeColumnDetailPane>
  );

  return (
    <>
      <ThreeColumnLayout
        preset={THREE_COLUMN_PRESETS.assetsModels}
        resizeAriaLabel="调整模特列表宽度"
        list={listPanel}
        detail={detailPanel}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogPopup className="p-0">
          <AlertDialogHeader>
            <AlertDialogTitle>删除模特</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除模特「{deleteTarget?.name}
              」吗？此操作无法撤销。已引用该模特的项目映射将失效。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              取消
            </AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? '删除中...' : '删除'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}

// ── 列表项 ──────────────────────────────────────────────────

function ModelListItem({
  model,
  selected,
  onSelect,
  onDelete,
}: {
  model: ModelAsset;
  selected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  const imageUrl = model.primaryImage ? getImageUrl(model.primaryImage) : null;
  const meta = [
    model.gender ? GENDER_LABELS[model.gender] : null,
    model.ageRangeMin != null || model.ageRangeMax != null
      ? model.ageRangeMin != null && model.ageRangeMax != null
        ? `${model.ageRangeMin}-${model.ageRangeMax}岁`
        : model.ageRangeMin != null
          ? `${model.ageRangeMin}岁+`
          : `${model.ageRangeMax}岁以下`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
          selected
            ? 'bg-accent text-accent-foreground'
            : 'hover:bg-accent/50',
        )}
        onClick={onSelect}
      >
        <div className="w-9 h-9 rounded-lg bg-muted overflow-hidden shrink-0">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={model.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <User className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{model.name}</div>
          {meta && (
            <div className="text-xs text-muted-foreground truncate">{meta}</div>
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuPopup>
        {onDelete && (
          <ContextMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 className="w-4 h-4" />
            删除
          </ContextMenuItem>
        )}
      </ContextMenuPopup>
    </ContextMenu>
  );
}

// ── 属性面板（统一创建/编辑，始终可编辑） ──────────────────

const fieldCls =
  'h-8 w-full rounded-lg border border-transparent bg-background/92 px-2.5 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_0_0_1px_rgba(60,60,67,0.12)] transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#007AFF]/28 focus-visible:shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_0_0_1px_rgba(0,122,255,0.35)] dark:bg-background/75 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_1px_rgba(255,255,255,0.12)] dark:focus-visible:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_0_1px_rgba(10,132,255,0.55)] placeholder:text-muted-foreground/70';

const textareaCls =
  'w-full rounded-lg border border-transparent bg-background/92 px-3 py-2 text-sm text-foreground leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_0_0_1px_rgba(60,60,67,0.12)] transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#007AFF]/28 focus-visible:shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_0_0_1px_rgba(0,122,255,0.35)] dark:bg-background/75 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_1px_rgba(255,255,255,0.12)] dark:focus-visible:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_0_1px_rgba(10,132,255,0.55)] placeholder:text-muted-foreground/70 resize-none';

const macImageUploaderCls =
  '[&>button]:rounded-xl [&>button]:border [&>button]:border-input/70 [&>button]:border-solid [&>button]:bg-muted/35 [&>button]:p-6 [&>button]:hover:bg-muted/55 [&>button]:transition-colors';

const noSpinCls =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

function ModelPropertyPanel({
  model,
  onSave,
  onDelete,
  onCancel,
  loading,
}: {
  model: ModelAsset | null;
  onSave: (data: CreateModelAssetInput) => Promise<void>;
  onDelete?: () => void;
  onCancel?: () => void;
  loading: boolean;
}) {
  const isCreate = !model;

  // ── 表单状态 ──
  const [name, setName] = useState(model?.name || '');
  const [gender, setGender] = useState(model?.gender || '');
  const [ageMin, setAgeMin] = useState(
    model?.ageRangeMin != null ? String(model.ageRangeMin) : '',
  );
  const [ageMax, setAgeMax] = useState(
    model?.ageRangeMax != null ? String(model.ageRangeMax) : '',
  );
  const [description, setDescription] = useState(model?.description || '');
  const [appearancePrompt, setAppearancePrompt] = useState(
    model?.appearancePrompt || '',
  );
  const [primaryImage, setPrimaryImage] = useState(model?.primaryImage || '');
  const [referenceImages, setReferenceImages] = useState<string[]>(
    model?.referenceImages || [],
  );
  const [tagsInput, setTagsInput] = useState(model?.tags?.join(', ') || '');

  // ── 脏检测 ──
  const isDirty = useMemo(() => {
    if (isCreate) return name.trim().length > 0;
    return (
      name !== (model.name || '') ||
      gender !== (model.gender || '') ||
      ageMin !== (model.ageRangeMin != null ? String(model.ageRangeMin) : '') ||
      ageMax !== (model.ageRangeMax != null ? String(model.ageRangeMax) : '') ||
      description !== (model.description || '') ||
      appearancePrompt !== (model.appearancePrompt || '') ||
      primaryImage !== (model.primaryImage || '') ||
      JSON.stringify(referenceImages) !==
        JSON.stringify(model.referenceImages || []) ||
      tagsInput !== (model.tags?.join(', ') || '')
    );
  }, [
    isCreate,
    model,
    name,
    gender,
    ageMin,
    ageMax,
    description,
    appearancePrompt,
    primaryImage,
    referenceImages,
    tagsInput,
  ]);

  const handleDiscard = () => {
    setName(model?.name || '');
    setGender(model?.gender || '');
    setAgeMin(model?.ageRangeMin != null ? String(model.ageRangeMin) : '');
    setAgeMax(model?.ageRangeMax != null ? String(model.ageRangeMax) : '');
    setDescription(model?.description || '');
    setAppearancePrompt(model?.appearancePrompt || '');
    setPrimaryImage(model?.primaryImage || '');
    setReferenceImages(model?.referenceImages || []);
    setTagsInput(model?.tags?.join(', ') || '');
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    const tags = tagsInput
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean);
    await onSave({
      name: name.trim(),
      gender: (gender as 'male' | 'female' | 'other') || undefined,
      ageRangeMin: ageMin ? Number(ageMin) : undefined,
      ageRangeMax: ageMax ? Number(ageMax) : undefined,
      description: description.trim() || undefined,
      appearancePrompt: appearancePrompt.trim() || undefined,
      primaryImage: primaryImage || undefined,
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      tags: tags.length > 0 ? tags : undefined,
    });
  };

  const handleAddRef = (path: string) => {
    if (referenceImages.length >= 5) return;
    setReferenceImages([...referenceImages, path]);
  };

  const handleRemoveRef = (index: number) => {
    setReferenceImages(referenceImages.filter((_, i) => i !== index));
  };


  return (
    <div className="h-full flex flex-col">
      {/* 创建模式标题栏 */}
      {isCreate && (
        <div className="flex items-center justify-between px-6 py-3.5 border-b">
          <h2 className="text-base font-semibold">新模特</h2>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="p-1.5 rounded-md hover:bg-accent transition"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      )}

      {/* 可滚动内容区 */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
          {/* ── 头部：对象身份 ── */}
          <div className="rounded-xl border border-border/70 bg-card px-5 py-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.28)]">
            <div className="flex gap-5">
              <div className="w-32 shrink-0">
                <ImageUploader
                  value={primaryImage}
                  onChange={(path) => setPrimaryImage(path || '')}
                  placeholder="主照片"
                  className={macImageUploaderCls}
                />
              </div>

              <div className="min-w-0 flex-1 space-y-3">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="模特名称"
                  className="h-10 w-full rounded-lg border border-transparent bg-background/92 px-3 text-[1.1rem] font-semibold tracking-[-0.01em] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_0_0_1px_rgba(60,60,67,0.12)] transition placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#007AFF]/28 focus-visible:shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_0_0_1px_rgba(0,122,255,0.35)] dark:bg-background/75 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_1px_rgba(255,255,255,0.12)]"
                />

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">性别</span>
                    <SegmentedControl
                      value={gender as 'male' | 'female' | ''}
                      onValueChange={(v) => setGender(v)}
                      options={[
                        { value: 'male' as const, label: '男' },
                        { value: 'female' as const, label: '女' },
                      ]}
                      size="sm"
                      allowDeselect
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">年龄</span>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={ageMin}
                      onChange={(e) => setAgeMin(e.target.value)}
                      placeholder="下限"
                      className={cn(fieldCls, noSpinCls, 'w-[4.5rem]')}
                    />
                    <span className="text-muted-foreground">—</span>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={ageMax}
                      onChange={(e) => setAgeMax(e.target.value)}
                      placeholder="上限"
                      className={cn(fieldCls, noSpinCls, 'w-[4.5rem]')}
                    />
                    <span className="text-xs text-muted-foreground">岁</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">标签</span>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="逗号分隔"
                    className={fieldCls}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── 描述 ── */}
          <div className="rounded-xl border border-border/70 bg-card px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.28)]">
            <label
              htmlFor="model-desc"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              描述
            </label>
            <textarea
              id="model-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="关于这个模特的备注"
              rows={2}
              className={textareaCls}
            />
          </div>

          {/* ── 外观提示词 ── */}
          <div className="rounded-xl border border-border/70 bg-card px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.28)]">
            <label
              htmlFor="model-appearance"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              外观提示词
            </label>
            <textarea
              id="model-appearance"
              value={appearancePrompt}
              onChange={(e) => setAppearancePrompt(e.target.value)}
              placeholder="描述人物的外貌特征，如肤色、发型、体型、五官等"
              rows={4}
              className={textareaCls}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              将注入到出图提示词中，帮助 AI 保持人物外观一致
            </p>
          </div>

          {/* ── 辅助参考照 ── */}
          <div className="rounded-xl border border-border/70 bg-card px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.28)]">
            <div className="mb-1.5 text-sm font-medium text-foreground">
              辅助参考照
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                最多 5 张
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {referenceImages.map((img, i) => (
                <PhotoFrame
                  key={img}
                  src={getImageUrl(img)}
                  alt={`参考照 ${i + 1}`}
                  className="rounded-lg border border-input/80 bg-muted/20"
                >
                  <button
                    type="button"
                    onClick={() => handleRemoveRef(i)}
                    className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white transition hover:bg-black/80"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </PhotoFrame>
              ))}
              {referenceImages.length < 5 && (
                <ImageUploader
                  value=""
                  onChange={(path) => {
                    if (path) handleAddRef(path);
                  }}
                  placeholder="添加参考图"
                  className={macImageUploaderCls}
                />
              )}
            </div>
          </div>

          {/* ── 删除（仅编辑模式，沉入底部） ── */}
          {!isCreate && onDelete && (
            <div className="pt-4 border-t border-border/60">
              <button
                type="button"
                onClick={onDelete}
                className="text-sm text-destructive/70 hover:text-destructive transition"
              >
                删除此模特...
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── 底部操作栏 ── */}
      {isCreate ? (
        /* 创建模式：固定底栏 */
        <div className="border-t bg-background px-6 py-3 flex items-center justify-end gap-2">
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
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
        /* 编辑模式：有修改时浮出变更栏 */
        <div className="border-t bg-background/80 backdrop-blur-sm px-6 py-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">有未保存的修改</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleDiscard}>
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
