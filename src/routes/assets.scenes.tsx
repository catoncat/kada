'use client';

import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ImageIcon, Loader2 } from 'lucide-react';
import { SceneCard } from '@/components/assets/SceneCard';
import { SceneForm } from '@/components/assets/SceneForm';
import {
  getSceneAssets,
  createSceneAsset,
  updateSceneAsset,
  deleteSceneAsset,
} from '@/lib/scene-assets-api';
import type { SceneAsset, CreateSceneAssetInput } from '@/types/scene-asset';
import {
  Dialog,
  DialogPopup,
} from '@/components/ui/dialog';

export const Route = createFileRoute('/assets/scenes')({
  component: ScenesAssetPage,
});

function ScenesAssetPage() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingScene, setEditingScene] = useState<SceneAsset | null>(null);

  // 获取场景列表
  const { data, isLoading, error } = useQuery({
    queryKey: ['sceneAssets'],
    queryFn: getSceneAssets,
  });

  // 创建场景
  const createMutation = useMutation({
    mutationFn: createSceneAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sceneAssets'] });
      setIsFormOpen(false);
    },
  });

  // 更新场景
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateSceneAssetInput }) =>
      updateSceneAsset(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sceneAssets'] });
      setEditingScene(null);
    },
  });

  // 删除场景
  const deleteMutation = useMutation({
    mutationFn: deleteSceneAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sceneAssets'] });
    },
  });

  const handleCreate = () => {
    setEditingScene(null);
    setIsFormOpen(true);
  };

  const handleEdit = (scene: SceneAsset) => {
    setEditingScene(scene);
    setIsFormOpen(true);
  };

  const handleDelete = async (scene: SceneAsset) => {
    if (!confirm(`确定要删除场景「${scene.name}」吗？此操作无法撤销。`)) {
      return;
    }
    deleteMutation.mutate(scene.id);
  };

  const handleSubmit = async (data: CreateSceneAssetInput) => {
    if (editingScene) {
      await updateMutation.mutateAsync({ id: editingScene.id, data });
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingScene(null);
  };

  const scenes = data?.data || [];
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--ink-2)]">
          管理你的拍摄场景，上传场景照片并添加描述
        </p>
        <button
          type="button"
          onClick={handleCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition"
        >
          <Plus className="w-4 h-4" />
          新建场景
        </button>
      </div>

      {/* 加载状态 */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-[var(--primary)] animate-spin" />
        </div>
      )}

      {/* 错误状态 */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          加载失败：{error instanceof Error ? error.message : '未知错误'}
        </div>
      )}

      {/* 空状态 */}
      {!isLoading && !error && scenes.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--paper-2)] flex items-center justify-center mb-4">
              <ImageIcon className="w-8 h-8 text-[var(--ink-3)]" />
            </div>
            <h3 className="text-lg font-medium text-[var(--ink)]">还没有场景</h3>
            <p className="mt-1 text-sm text-[var(--ink-2)] max-w-sm">
              创建你的第一个场景资产，上传场景照片并添加描述，用于生成更精确的拍摄参考图
            </p>
            <button
              type="button"
              onClick={handleCreate}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition"
            >
              <Plus className="w-4 h-4" />
              新建场景
            </button>
          </div>
        </div>
      )}

      {/* 场景列表 */}
      {!isLoading && !error && scenes.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {scenes.map((scene) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              onEdit={() => handleEdit(scene)}
              onDelete={() => handleDelete(scene)}
            />
          ))}
        </div>
      )}

      {/* 新建/编辑表单对话框 */}
      <Dialog open={isFormOpen} onOpenChange={handleCloseForm}>
        <DialogPopup
          className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
          showCloseButton={false}
        >
          <SceneForm
            initialData={editingScene || undefined}
            onSubmit={handleSubmit}
            onCancel={handleCloseForm}
            loading={isSubmitting}
          />
        </DialogPopup>
      </Dialog>
    </div>
  );
}
