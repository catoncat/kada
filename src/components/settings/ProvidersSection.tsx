/**
 * 服务商管理区域
 * 包含列表视图和表单视图
 */

import { Loader2, Plus, ShieldCheck, Zap } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import type { ProviderConfig } from '@/types/provider';
import { PRESET_TEMPLATES } from '@/types/provider';
import { ProviderCard } from './ProviderCard';
import { ProviderForm } from './ProviderForm';
import { useProviders } from './hooks/use-providers';

type ViewMode = 'list' | 'add' | 'edit';

export function ProvidersSection() {
  const {
    providers,
    defaultProvider,
    addProvider,
    updateProvider,
    deleteProvider,
    setAsDefault,
    isLoading,
  } = useProviders();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<ProviderConfig | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const sectionHeader = (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-foreground">服务商</h2>
      <p className="text-sm text-muted-foreground">
        管理 AI 服务商、模型配置和默认调用源。
      </p>
    </div>
  );

  const handlePresetAdd = (preset: (typeof PRESET_TEMPLATES)[0]) => {
    setEditingProvider({
      id: '',
      ...preset,
      isDefault: providers.length === 0,
    });
    setViewMode('add');
  };

  const handleCustomAdd = () => {
    setEditingProvider(null);
    setViewMode('add');
  };

  const handleEdit = (provider: ProviderConfig) => {
    setEditingProvider(provider);
    setViewMode('edit');
  };

  const handleDelete = (provider: ProviderConfig) => {
    setDeleteError(null);
    setDeleteTarget(provider);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await deleteProvider(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '删除 Provider 失败');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmit = (data: Omit<ProviderConfig, 'id'>) => {
    if (viewMode === 'edit' && editingProvider) {
      updateProvider(editingProvider.id, data);
    } else {
      addProvider(data);
    }
    setViewMode('list');
    setEditingProvider(null);
  };

  const handleCancel = () => {
    setViewMode('list');
    setEditingProvider(null);
  };

  if (viewMode === 'add' || viewMode === 'edit') {
    return (
      <div className="space-y-6">
        {sectionHeader}
        <ProviderForm
          initialData={editingProvider || undefined}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        {sectionHeader}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">加载服务商配置中...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sectionHeader}

      {deleteError && (
        <Alert variant="error">
          <AlertDescription>{deleteError}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <Zap className="h-4 w-4 text-primary" />
          快速添加
        </h3>
        <div className="flex flex-wrap gap-2">
          {PRESET_TEMPLATES.map((preset) => (
            <Button
              key={preset.name}
              onClick={() => handlePresetAdd(preset)}
              className="rounded-xl"
              size="sm"
              variant="outline"
            >
              {preset.name}
            </Button>
          ))}
        </div>
      </div>

      {providers.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">已配置的服务商</h3>
          <div className="space-y-3">
            {providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                isDefault={defaultProvider?.id === provider.id}
                onSetDefault={() => setAsDefault(provider.id)}
                onEdit={() => handleEdit(provider)}
                onDelete={() => handleDelete(provider)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card py-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <ShieldCheck className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="mb-1 text-sm text-muted-foreground">还没有配置任何服务商</p>
          <p className="text-xs text-muted-foreground">
            点击上方快速添加，或创建一个自定义服务商
          </p>
        </div>
      )}

      <Button
        className="w-full justify-center gap-2 rounded-xl border-dashed"
        onClick={handleCustomAdd}
        size="lg"
        variant="outline"
      >
        <Plus className="h-4 w-4" />
        添加自定义服务商
      </Button>

      <Alert className="text-xs" variant="info">
        <ShieldCheck className="mr-2 h-4 w-4 shrink-0" />
        <AlertDescription>
          <b>隐私提示：</b>配置仅保存在你的浏览器本地，不会上传到任何服务器。
        </AlertDescription>
      </Alert>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogPopup className="p-0">
          <AlertDialogHeader>
            <AlertDialogTitle>删除 Provider</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deleteTarget?.name}」吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              取消
            </AlertDialogClose>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? '删除中...' : '删除'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}
