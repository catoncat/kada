'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ImageIcon, Loader2, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SceneCard } from '@/components/assets/SceneCard';
import { SceneForm } from '@/components/assets/SceneForm';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogPopup } from '@/components/ui/dialog';
import {
  createSceneAsset,
  deleteSceneAsset,
  getSceneAssets,
  updateSceneAsset,
} from '@/lib/scene-assets-api';
import type { CreateSceneAssetInput, SceneAsset } from '@/types/scene-asset';

// Search params 类型
interface ScenesSearchParams {
  action?: 'create';
}

export const Route = createFileRoute('/assets/scenes')({
  component: ScenesAssetPage,
  validateSearch: (search: Record<string, unknown>): ScenesSearchParams => ({
    action: search.action === 'create' ? 'create' : undefined,
  }),
});

function ScenesAssetPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { action } = Route.useSearch();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingScene, setEditingScene] = useState<SceneAsset | null>(null);

  // 处理 action=create 参数
  useEffect(() => {
    if (action === 'create') {
      setEditingScene(null);
      setIsFormOpen(true);
      // 清除 URL 参数
      navigate({ to: '/assets/scenes', search: {}, replace: true });
    }
  }, [action, navigate]);

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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">场景管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          管理你的拍摄场景，上传场景照片并添加描述
        </p>
      </div>

      {/* 操作栏 */}
      <div className="flex items-center justify-end">
        <Button onClick={handleCreate}>
          <Plus className="w-4 h-4" />
          新建场景
        </Button>
      </div>

      {/* 加载状态 */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      )}

      {/* 错误状态 */}
      {error && (
        <Alert variant="error">
          <AlertTitle>加载失败</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : '未知错误'}
          </AlertDescription>
        </Alert>
      )}

      {/* 空状态 */}
      {!isLoading && !error && scenes.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <ImageIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground">还没有场景</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              创建你的第一个场景资产，上传场景照片并添加描述，用于生成更精确的拍摄参考图
            </p>
            <Button className="mt-6" onClick={handleCreate}>
              <Plus className="w-4 h-4" />
              新建场景
            </Button>
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
