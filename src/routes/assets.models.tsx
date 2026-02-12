'use client';

import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, User, Loader2 } from 'lucide-react';
import { ModelCard } from '@/components/assets/ModelCard';
import { ModelForm } from '@/components/assets/ModelForm';
import {
  getModelAssets,
  createModelAsset,
  updateModelAsset,
  deleteModelAsset,
} from '@/lib/model-assets-api';
import type { ModelAsset, CreateModelAssetInput } from '@/types/model-asset';
import {
  Dialog,
  DialogPopup,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export const Route = createFileRoute('/assets/models')({
  component: ModelsAssetPage,
});

function ModelsAssetPage() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelAsset | null>(null);

  // 获取模特列表（全局模特）
  const { data, isLoading, error } = useQuery({
    queryKey: ['modelAssets'],
    queryFn: () => getModelAssets(),
  });

  // 创建模特
  const createMutation = useMutation({
    mutationFn: createModelAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modelAssets'] });
      setIsFormOpen(false);
    },
  });

  // 更新模特
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateModelAssetInput }) =>
      updateModelAsset(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modelAssets'] });
      setEditingModel(null);
      setIsFormOpen(false);
    },
  });

  // 删除模特
  const deleteMutation = useMutation({
    mutationFn: deleteModelAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modelAssets'] });
    },
  });

  const handleCreate = () => {
    setEditingModel(null);
    setIsFormOpen(true);
  };

  const handleEdit = (model: ModelAsset) => {
    setEditingModel(model);
    setIsFormOpen(true);
  };

  const handleDelete = async (model: ModelAsset) => {
    if (
      !confirm(
        `确定要删除模特「${model.name}」吗？此操作无法撤销。已引用该模特的项目映射将失效。`,
      )
    ) {
      return;
    }
    deleteMutation.mutate(model.id);
  };

  const handleSubmit = async (data: CreateModelAssetInput) => {
    if (editingModel) {
      await updateMutation.mutateAsync({ id: editingModel.id, data });
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingModel(null);
  };

  const models = data?.data || [];
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          管理你的模特资产，上传参考照片用于保持人物一致性
        </p>
        <Button onClick={handleCreate}>
          <Plus className="w-4 h-4" />
          新建模特
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
            {error instanceof Error ? error.message : '获取模特列表失败'}
          </AlertDescription>
        </Alert>
      )}

      {/* 空状态 */}
      {!isLoading && !error && models.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <User className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground">还没有模特资产</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              创建模特资产并上传参考照片，用于生成预览图时保持人物一致性
            </p>
            <Button className="mt-6" onClick={handleCreate}>
              <Plus className="w-4 h-4" />
              新建模特
            </Button>
          </div>
        </div>
      )}

      {/* 模特列表 */}
      {!isLoading && !error && models.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              onEdit={() => handleEdit(model)}
              onDelete={() => handleDelete(model)}
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
          <ModelForm
            initialData={editingModel || undefined}
            onSubmit={handleSubmit}
            onCancel={handleCloseForm}
            loading={isSubmitting}
          />
        </DialogPopup>
      </Dialog>
    </div>
  );
}
