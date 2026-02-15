'use client';

import { Loader2, RefreshCw, Save, SearchCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  useEmbeddingProfile,
  useEmbeddingStatus,
  useReindexEmbeddings,
  useSaveEmbeddingProfile,
} from '@/hooks/useEmbeddings';

interface FormState {
  id?: string;
  endpoint: string;
  apiKeyRef: string;
  model: string;
  vectorDim: number;
  normalize: boolean;
}

const DEFAULT_FORM: FormState = {
  endpoint: '',
  apiKeyRef: '',
  model: '',
  vectorDim: 1024,
  normalize: true,
};

export function EmbeddingsSection() {
  const { data: profile, isLoading: isProfileLoading, error: profileError } = useEmbeddingProfile();
  const { data: status, isLoading: isStatusLoading } = useEmbeddingStatus();
  const saveMutation = useSaveEmbeddingProfile();
  const reindexMutation = useReindexEmbeddings();

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setForm({
      id: profile.id,
      endpoint: profile.endpoint,
      apiKeyRef: profile.apiKeyRef || '',
      model: profile.model,
      vectorDim: profile.vectorDim,
      normalize: profile.normalize,
    });
  }, [profile?.id, profile?.endpoint, profile?.apiKeyRef, profile?.model, profile?.vectorDim, profile?.normalize]);

  const isBusy = saveMutation.isPending || reindexMutation.isPending;
  const canSubmit = useMemo(
    () =>
      form.endpoint.trim().length > 0 &&
      form.model.trim().length > 0 &&
      Number.isFinite(form.vectorDim) &&
      form.vectorDim > 0,
    [form.endpoint, form.model, form.vectorDim],
  );

  const handleSave = async () => {
    setMessage(null);
    try {
      const response = await saveMutation.mutateAsync({
        id: form.id,
        endpoint: form.endpoint.trim(),
        apiKeyRef: form.apiKeyRef.trim() || null,
        model: form.model.trim(),
        vectorDim: Math.round(form.vectorDim),
        normalize: form.normalize,
      });
      setMessage(
        response.needsReindex
          ? '配置已保存，已进入重建队列。'
          : '配置已保存。',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    }
  };

  const handleReindex = async () => {
    setMessage(null);
    try {
      await reindexMutation.mutateAsync(profile?.id);
      setMessage('已提交全量重建任务。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '重建任务提交失败');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-foreground">Embedding 配置</h2>
        <p className="text-sm text-muted-foreground">
          配置图片/文本向量模型，向量存储与检索均在本地 SQLite 完成。
        </p>
      </div>

      {(profileError || message) && (
        <Alert variant={profileError ? 'error' : 'info'}>
          <AlertDescription>
            {profileError instanceof Error ? profileError.message : message}
          </AlertDescription>
        </Alert>
      )}

      {(isProfileLoading || isStatusLoading) ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span>加载 embedding 配置中...</span>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-4 rounded-xl border border-border bg-card p-4">
            <div className="grid gap-2">
              <Label htmlFor="embedding-endpoint">Embedding API 端口</Label>
              <Input
                id="embedding-endpoint"
                placeholder="例如: http://localhost:9000/v1/embeddings"
                value={form.endpoint}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, endpoint: event.target.value }))
                }
                disabled={isBusy}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="embedding-api-key">API Key（可选）</Label>
              <Input
                id="embedding-api-key"
                type="password"
                placeholder="留空表示不使用鉴权头"
                value={form.apiKeyRef}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, apiKeyRef: event.target.value }))
                }
                disabled={isBusy}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="embedding-model">模型名</Label>
                <Input
                  id="embedding-model"
                  placeholder="例如: jina-clip-v2"
                  value={form.model}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, model: event.target.value }))
                  }
                  disabled={isBusy}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="embedding-dim">向量维度</Label>
                <Input
                  id="embedding-dim"
                  type="number"
                  min={1}
                  step={1}
                  value={form.vectorDim}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      vectorDim: Number(event.target.value || 0),
                    }))
                  }
                  disabled={isBusy}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-foreground">L2 Normalize</p>
                <p className="text-xs text-muted-foreground">
                  开启后将向量归一化，便于余弦相似度检索。
                </p>
              </div>
              <Switch
                checked={form.normalize}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, normalize: checked }))
                }
                disabled={isBusy}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void handleSave()}
                disabled={!canSubmit || isBusy}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                保存配置
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleReindex()}
                disabled={isBusy || !profile}
              >
                {reindexMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                全量重建索引
              </Button>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">索引状态</h3>
              <Badge variant="outline">
                {status?.vectorEngine.mode === 'sqlite-vec'
                  ? 'sqlite-vec'
                  : 'fallback-scan'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatItem label="总资产" value={status?.stats.totalAssets ?? 0} />
              <StatItem label="已索引" value={status?.stats.indexedAssets ?? 0} />
              <StatItem label="待处理" value={status?.tasks.pending ?? 0} />
              <StatItem label="运行中" value={status?.tasks.running ?? 0} />
            </div>

            <div className="text-xs text-muted-foreground">
              覆盖率：{Math.round((status?.stats.coverage ?? 0) * 100)}%
            </div>

            {status?.profile && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <SearchCheck className="size-4" />
                <span>
                  当前 profile: {status.profile.model} ({status.profile.vectorDim}D,{' '}
                  {status.profile.status})
                </span>
              </div>
            )}

            {status?.vectorEngine.detail && (
              <p className="text-xs text-muted-foreground">
                引擎信息：{status.vectorEngine.detail}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
