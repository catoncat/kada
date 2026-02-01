/**
 * 服务商表单组件
 * 用于添加或编辑服务商配置
 */

import { useState, useEffect, useRef } from 'react';
import {
  Key,
  Eye,
  EyeOff,
  RefreshCw,
  AlertTriangle,
  ArrowLeft,
} from 'lucide-react';
import type { ProviderConfig, ApiFormat } from '@/types/provider';
import { useModelFetcher } from './hooks/use-model-fetcher';
import { ModelCombobox } from './ModelCombobox';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ProviderFormProps {
  initialData?: ProviderConfig;
  onSubmit: (data: Omit<ProviderConfig, 'id'>) => void;
  onCancel: () => void;
}

export function ProviderForm({ initialData, onSubmit, onCancel }: ProviderFormProps) {
  // 表单状态
  const [name, setName] = useState(initialData?.name || '');
  const [format, setFormat] = useState<ApiFormat>(initialData?.format || 'gemini');
  const [apiKey, setApiKey] = useState(initialData?.apiKey || '');
  const [baseUrl, setBaseUrl] = useState(initialData?.baseUrl || '');
  const [textModel, setTextModel] = useState(initialData?.textModel || '');
  const [imageModel, setImageModel] = useState(initialData?.imageModel || '');
  const [isDefault, setIsDefault] = useState(initialData?.isDefault || false);
  const [showKey, setShowKey] = useState(false);

  // 模型获取
  const { models, textModels, imageModels, isLoading, error, fetchModels, reset } = useModelFetcher();

  // 用于追踪是否已经自动选择过模型（只在首次获取时自动选择）
  const hasAutoSelectedRef = useRef(false);

  // 当格式变化时，更新默认 Base URL
  useEffect(() => {
    if (!initialData) {
      if (format === 'gemini') {
        setBaseUrl('https://generativelanguage.googleapis.com/v1beta');
      } else {
        setBaseUrl('https://api.openai.com/v1');
      }
    }
  }, [format, initialData]);

  // 获取模型列表
  const handleFetchModels = async () => {
    const tempProvider: ProviderConfig = {
      id: 'temp',
      name: name || '临时配置',
      format,
      baseUrl: baseUrl || (format === 'gemini'
        ? 'https://generativelanguage.googleapis.com/v1beta'
        : 'https://api.openai.com/v1'),
      apiKey,
      textModel,
      imageModel,
      isDefault: false,
    };
    await fetchModels(tempProvider);
  };

  // 自动选择模型（只在首次获取模型列表时执行一次）
  useEffect(() => {
    if (models.length > 0 && !hasAutoSelectedRef.current) {
      hasAutoSelectedRef.current = true;
      if (!textModel && textModels.length > 0) {
        setTextModel(textModels[0].id);
      }
      if (!imageModel && imageModels.length > 0) {
        setImageModel(imageModels[0].id);
      }
    }
  }, [models, textModels, imageModels, textModel, imageModel]);

  // 提交表单
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: name || (format === 'gemini' ? 'Google AI Studio' : 'OpenAI 兼容'),
      format,
      baseUrl,
      apiKey,
      textModel,
      imageModel,
      isDefault,
    });
  };

  const isEditing = !!initialData;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* 返回按钮 */}
      <button
        type="button"
        onClick={onCancel}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
      >
        <ArrowLeft className="w-4 h-4" />
        {isEditing ? '返回列表' : '取消添加'}
      </button>

      <h3 className="text-lg font-semibold text-foreground">
        {isEditing ? '编辑服务商' : '添加服务商'}
      </h3>

      {/* 名称 */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          名称
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="例如：我的 API"
          className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
      </div>

      {/* API 格式 */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          API 格式
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => { setFormat('gemini'); reset(); hasAutoSelectedRef.current = false; }}
            className={cn(
              'rounded-xl border px-4 py-2 text-sm font-medium transition',
              format === 'gemini'
                ? 'border-primary/40 bg-primary/5 text-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            Gemini 原生
          </button>
          <button
            type="button"
            onClick={() => { setFormat('openai'); reset(); hasAutoSelectedRef.current = false; }}
            className={cn(
              'rounded-xl border px-4 py-2 text-sm font-medium transition',
              format === 'openai'
                ? 'border-primary/40 bg-primary/5 text-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            OpenAI 兼容
          </button>
        </div>
      </div>

      {/* API Key */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2 flex items-center">
          <Key className="w-4 h-4 mr-2 text-muted-foreground" /> API Key
        </label>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="在此粘贴你的 API Key"
            className="w-full rounded-xl border border-input bg-background px-4 py-3 pr-12 text-sm font-mono text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
          <button
            type="button"
            onClick={() => setShowKey(v => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 hover:bg-accent transition"
            title={showKey ? '隐藏' : '显示'}
          >
            {showKey ? (
              <EyeOff className="w-5 h-5 text-muted-foreground" />
            ) : (
              <Eye className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      {/* Base URL */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Base URL
        </label>
        <input
          type="text"
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          placeholder={format === 'gemini'
            ? 'https://generativelanguage.googleapis.com/v1beta'
            : 'https://api.openai.com/v1'
          }
          className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
      </div>

      {/* 模型选择区域 */}
      <div className="space-y-4">
        {/* 获取模型列表按钮 */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleFetchModels}
            disabled={isLoading || !apiKey}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition',
              isLoading || !apiKey
                ? 'border-border bg-muted text-muted-foreground cursor-not-allowed'
                : 'border-primary/40 bg-primary/5 text-primary hover:bg-primary/10'
            )}
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            {isLoading ? '获取中...' : '获取模型列表'}
          </button>
          <span className="text-xs text-muted-foreground">
            {models.length > 0
              ? `已获取 ${models.length} 个模型`
              : '可直接输入模型名称，或获取列表选择'}
          </span>
        </div>

        {error && (
          <Alert className="text-xs" variant="error">
            <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
            <AlertDescription className="text-destructive-foreground">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* 文生文模型 */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            文生文模型
          </label>
          <ModelCombobox
            value={textModel}
            onChange={setTextModel}
            models={models}
            filterCapability="text"
            placeholder="输入或选择文生文模型，如 gemini-2.5-flash"
          />
        </div>

        {/* 文生图模型 */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            文生图模型
          </label>
          <ModelCombobox
            value={imageModel}
            onChange={setImageModel}
            models={models}
            filterCapability="image"
            placeholder="输入或选择文生图模型（可选）"
          />
        </div>
      </div>

      {/* 设为默认 */}
      <label className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-accent/50 transition cursor-pointer">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={e => setIsDefault(e.target.checked)}
          className="w-4 h-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
        <span className="text-sm text-foreground">设为默认服务商</span>
      </label>

      {/* 提交按钮 */}
      <Button
        className="w-full rounded-xl"
        disabled={!apiKey}
        size="lg"
        type="submit"
      >
        {isEditing ? '保存修改' : '添加服务商'}
      </Button>
    </form>
  );
}
