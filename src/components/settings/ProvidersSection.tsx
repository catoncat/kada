/**
 * 服务商管理区域
 * 包含列表视图和表单视图
 */

import { useState } from 'react';
import { Plus, Zap, ShieldCheck } from 'lucide-react';
import type { ProviderConfig } from '@/types/provider';
import { PRESET_TEMPLATES } from '@/types/provider';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  } = useProviders();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);

  // 使用预设模板添加
  const handlePresetAdd = (preset: typeof PRESET_TEMPLATES[0]) => {
    setEditingProvider({
      id: '',
      ...preset,
      isDefault: providers.length === 0,
    });
    setViewMode('add');
  };

  // 添加自定义服务商
  const handleCustomAdd = () => {
    setEditingProvider(null);
    setViewMode('add');
  };

  // 编辑服务商
  const handleEdit = (provider: ProviderConfig) => {
    setEditingProvider(provider);
    setViewMode('edit');
  };

  // 删除服务商
  const handleDelete = (provider: ProviderConfig) => {
    if (confirm(`确定要删除「${provider.name}」吗？`)) {
      deleteProvider(provider.id);
    }
  };

  // 提交表单
  const handleSubmit = (data: Omit<ProviderConfig, 'id'>) => {
    if (viewMode === 'edit' && editingProvider) {
      updateProvider(editingProvider.id, data);
    } else {
      addProvider(data);
    }
    setViewMode('list');
    setEditingProvider(null);
  };

  // 取消编辑
  const handleCancel = () => {
    setViewMode('list');
    setEditingProvider(null);
  };

  // 表单视图
  if (viewMode === 'add' || viewMode === 'edit') {
    return (
      <ProviderForm
        initialData={editingProvider || undefined}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    );
  }

  // 列表视图
  return (
    <div className="space-y-6">
      {/* 快速添加区 */}
      <div>
        <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          快速添加
        </h3>
        <div className="flex gap-2 flex-wrap">
          {PRESET_TEMPLATES.map(preset => (
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

      {/* 已配置的服务商 */}
      {providers.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">
            已配置的服务商
          </h3>
          <div className="space-y-3">
            {providers.map(provider => (
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
      )}

      {/* 空状态 */}
      {providers.length === 0 && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground mb-1">还没有配置任何服务商</p>
          <p className="text-xs text-muted-foreground">
            点击上方的快速添加按钮开始配置
          </p>
        </div>
      )}

      {/* 添加自定义服务商按钮 */}
      <Button
        className="w-full justify-center gap-2 rounded-xl border-dashed"
        onClick={handleCustomAdd}
        size="lg"
        variant="outline"
      >
        <Plus className="w-4 h-4" />
        添加自定义服务商
      </Button>

      {/* 隐私提示 */}
      <Alert className="text-xs" variant="info">
        <ShieldCheck className="w-4 h-4 mr-2 flex-shrink-0" />
        <AlertDescription>
          <b>隐私提示：</b>配置仅保存在你的浏览器本地，不会上传到任何服务器。
        </AlertDescription>
      </Alert>
    </div>
  );
}
