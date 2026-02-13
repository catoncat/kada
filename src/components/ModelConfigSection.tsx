'use client';

import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, X, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { PhotoFrame } from '@/components/PhotoFrame';
import { getModelAssets, autoMatchModels, createModelAsset } from '@/lib/model-assets-api';
import { getImageUrl } from '@/lib/scene-assets-api';
import type { ModelAsset, CreateModelAssetInput, ProjectModelConfig } from '@/types/model-asset';
import type { CustomerInfo } from '@/types/project';
import { ModelForm } from '@/components/assets/ModelForm';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogPopup,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ModelConfigSectionProps {
  customer?: CustomerInfo;
  selectedModels?: string;
  onUpdate: (config: ProjectModelConfig) => void;
}

const GENDER_LABELS: Record<string, string> = {
  male: '男',
  female: '女',
  other: '其他',
};

function parseProjectModelConfig(
  selectedModels?: string,
): ProjectModelConfig {
  if (!selectedModels) return { personModelMap: {}, autoMatch: false };
  try {
    const parsed = JSON.parse(selectedModels);
    if (!parsed || typeof parsed !== 'object') {
      return { personModelMap: {}, autoMatch: false };
    }
    const personModelMap =
      typeof parsed.personModelMap === 'object' && parsed.personModelMap
        ? parsed.personModelMap
        : {};
    return {
      personModelMap,
      autoMatch: Boolean(parsed.autoMatch),
    };
  } catch {
    return { personModelMap: {}, autoMatch: false };
  }
}

export function ModelConfigSection({
  customer,
  selectedModels,
  onUpdate,
}: ModelConfigSectionProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formTargetPersonId, setFormTargetPersonId] = useState<string | null>(
    null,
  );
  const [isMatchDialogOpen, setIsMatchDialogOpen] = useState(false);
  const [matchResults, setMatchResults] = useState<Record<string, Array<{ modelId: string; name: string; score: number }>>>({});
  const [selectedPick, setSelectedPick] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<ProjectModelConfig>(() =>
    parseProjectModelConfig(selectedModels),
  );

  const people = customer?.people || [];
  const peopleMap = useMemo(
    () => new Map(people.map((p) => [p.id, p])),
    [people],
  );

  useEffect(() => {
    setConfig(parseProjectModelConfig(selectedModels));
  }, [selectedModels]);

  // 获取模特列表
  const { data: modelsData } = useQuery({
    queryKey: ['modelAssets'],
    queryFn: () => getModelAssets(),
  });

  const allModels = modelsData?.data || [];
  const modelMap = new Map(allModels.map((m) => [m.id, m]));

  const commitConfig = (nextConfig: ProjectModelConfig) => {
    setConfig(nextConfig);
    onUpdate(nextConfig);
  };

  // 计算配置状态
  const mappedCount = people.filter((p) => {
    const modelId = config.personModelMap[p.id];
    return modelId && modelMap.has(modelId);
  }).length;

  // 创建模特 mutation
  const createMutation = useMutation({
    mutationFn: createModelAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modelAssets'] });
      setIsFormOpen(false);
      setFormTargetPersonId(null);
    },
  });

  const openCreateForm = (personId?: string) => {
    setFormTargetPersonId(personId || null);
    setIsFormOpen(true);
  };

  // 自动匹配
  const [isMatching, setIsMatching] = useState(false);
  const handleAutoMatch = async () => {
    if (people.length === 0) return;
    setIsMatching(true);
    try {
      const result = await autoMatchModels(
        people.map((p) => ({
          id: p.id,
          role: p.role,
          gender: p.gender,
          age: p.age,
        })),
      );
      setMatchResults(result.matches);
      // 预选每个人物的第一个推荐
      const picks: Record<string, string> = {};
      for (const [personId, matches] of Object.entries(result.matches)) {
        if (matches.length > 0) {
          picks[personId] = matches[0].modelId;
        }
      }
      setSelectedPick(picks);
      setIsMatchDialogOpen(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : '自动匹配失败');
    } finally {
      setIsMatching(false);
    }
  };

  // 应用匹配结果
  const handleApplyMatch = () => {
    const newMap = { ...config.personModelMap, ...selectedPick };
    commitConfig({ personModelMap: newMap, autoMatch: true });
    setIsMatchDialogOpen(false);
  };

  // 手动选择模特
  const handleSelectModel = (personId: string, modelId: string) => {
    const newMap = { ...config.personModelMap, [personId]: modelId };
    commitConfig({ ...config, personModelMap: newMap });
  };

  // 移除映射
  const handleRemoveMapping = (personId: string) => {
    const newMap = { ...config.personModelMap };
    delete newMap[personId];
    commitConfig({ ...config, personModelMap: newMap });
  };

  // 创建模特
  const handleCreateModel = async (data: CreateModelAssetInput) => {
    const created = await createMutation.mutateAsync(data);
    if (formTargetPersonId && created.id) {
      const newMap = {
        ...config.personModelMap,
        [formTargetPersonId]: created.id,
      };
      commitConfig({ ...config, personModelMap: newMap });
    }
  };

  // 无客户信息
  if (!customer || people.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-medium">模特配置（可选）</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            未配置
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          请先填写客户信息，添加拍摄人物后即可配置模特
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-5">
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-medium">模特配置（可选）</h3>
            <output
              className={cn(
                'text-xs px-2 py-0.5 rounded-full',
                mappedCount === people.length && mappedCount > 0
                  ? 'bg-success/10 text-success'
                  : 'bg-muted text-muted-foreground',
              )}
              aria-label={`模特配置状态：已配置 ${mappedCount} / ${people.length}`}
            >
              {mappedCount === 0
                ? '未配置'
                : `已配置 ${mappedCount}/${people.length}`}
            </output>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleAutoMatch}
              disabled={isMatching || allModels.length === 0}
            >
              {isMatching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {isMatching ? '匹配中...' : '自动匹配'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => openCreateForm()}>
              <Plus className="w-4 h-4" />
              新建模特
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigate({
                  to: '/assets/models',
                  search: { action: 'create' },
                });
              }}
            >
              打开模特库
            </Button>
          </div>
        </div>

        {/* 人物-模特映射列表 */}
        <div className="space-y-3">
          {people.map((person) => {
            const modelId = config.personModelMap[person.id];
            const model = modelId ? modelMap.get(modelId) : null;
            const isDangling = modelId && !model;

            return (
              <div
                key={person.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background"
              >
                {/* 人物信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span>{person.role}</span>
                    {(person.gender || person.age != null) && (
                      <span className="text-muted-foreground">
                        （{[
                          person.gender ? GENDER_LABELS[person.gender] || person.gender : '',
                          person.age != null ? `${person.age}岁` : '',
                        ]
                          .filter(Boolean)
                          .join('，')}
                        ）
                      </span>
                    )}
                  </div>

                  {/* 映射状态 */}
                  {isDangling ? (
                    <div className="mt-1 flex items-center gap-1 text-sm text-warning" role="alert">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>模特已被删除，请重新选择</span>
                    </div>
                  ) : model ? (
                    <div className="mt-1 flex items-center gap-2">
                      {model.primaryImage && (
                        <PhotoFrame
                          src={getImageUrl(model.primaryImage)}
                          alt={model.name}
                          className="h-8 rounded shrink-0"
                        />
                      )}
                      <span className="text-sm text-muted-foreground">
                        模特：{model.name}
                        {model.appearancePrompt && (
                          <span className="ml-1 opacity-60">
                            （{model.appearancePrompt.slice(0, 20)}
                            {model.appearancePrompt.length > 20 ? '...' : ''}）
                          </span>
                        )}
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {model || isDangling ? (
                    <>
                      <ModelSelector
                        models={allModels}
                        currentModelId={modelId}
                        onSelect={(id) => handleSelectModel(person.id, id)}
                        label="更换"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveMapping(person.id)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                        aria-label="移除映射"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <ModelSelector
                        models={allModels}
                        onSelect={(id) => handleSelectModel(person.id, id)}
                        label="选择模特"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => openCreateForm(person.id)}
                      >
                        新建并绑定
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 可选提示 */}
        <p className="mt-4 text-xs text-muted-foreground">
          模特配置为可选步骤，跳过后生成的预览图不含人物参考
        </p>
      </div>

      {/* 新建模特弹窗 */}
      <Dialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) setFormTargetPersonId(null);
        }}
      >
        <DialogPopup
          className="w-full max-w-[860px] h-[680px] overflow-hidden p-0"
          showCloseButton={false}
        >
          {formTargetPersonId && (
            <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
              创建完成后将自动绑定到「
              {peopleMap.get(formTargetPersonId)?.role || '当前人物'}
              」
            </div>
          )}
          <ModelForm
            onSubmit={handleCreateModel}
            onCancel={() => {
              setIsFormOpen(false);
              setFormTargetPersonId(null);
            }}
            loading={createMutation.isPending}
          />
        </DialogPopup>
      </Dialog>

      {/* 自动匹配结果弹窗 */}
      <Dialog open={isMatchDialogOpen} onOpenChange={setIsMatchDialogOpen}>
        <DialogPopup
          className="w-full max-w-lg max-h-[80vh] overflow-y-auto p-6"
          showCloseButton={false}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h2 className="text-lg font-semibold">自动匹配推荐</h2>
              <button
                type="button"
                onClick={() => setIsMatchDialogOpen(false)}
                className="p-2 rounded-lg hover:bg-accent transition"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {people.map((person) => {
              const matches = matchResults[person.id] || [];
              return (
                <div key={person.id} className="p-3 rounded-lg border border-border">
                  <div className="text-sm font-medium mb-2">
                    {person.role}
                    {person.gender || person.age != null
                      ? `（${[
                          person.gender ? GENDER_LABELS[person.gender] : '',
                          person.age != null ? `${person.age}岁` : '',
                        ]
                          .filter(Boolean)
                          .join('，')}）`
                      : ''}
                  </div>
                  {matches.length === 0 ? (
                    <p className="text-sm text-muted-foreground">无匹配结果</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {matches.map((match) => (
                        <button
                          key={match.modelId}
                          type="button"
                          onClick={() =>
                            setSelectedPick((prev) => ({
                              ...prev,
                              [person.id]: match.modelId,
                            }))
                          }
                          className={cn(
                            'px-3 py-1.5 rounded-lg text-sm transition',
                            selectedPick[person.id] === match.modelId
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-accent',
                          )}
                        >
                          {match.name}（{match.score}分）
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedPick((prev) => {
                            const next = { ...prev };
                            delete next[person.id];
                            return next;
                          })
                        }
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-sm transition',
                          !selectedPick[person.id]
                            ? 'bg-muted/80 text-foreground'
                            : 'text-muted-foreground hover:bg-accent',
                        )}
                      >
                        跳过
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <Button
                variant="outline"
                onClick={() => setIsMatchDialogOpen(false)}
              >
                取消
              </Button>
              <Button onClick={handleApplyMatch}>
                全部应用推荐
              </Button>
            </div>
          </div>
        </DialogPopup>
      </Dialog>
    </>
  );
}

// 简单的模特选择器
function ModelSelector({
  models,
  currentModelId,
  onSelect,
  label,
}: {
  models: ModelAsset[];
  currentModelId?: string;
  onSelect: (modelId: string) => void;
  label: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 rounded-lg text-sm font-medium text-primary hover:bg-primary/10 transition"
      >
        {label}
      </button>
      {isOpen && (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay for dismissing dropdown */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            onKeyDown={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 z-50 w-56 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover shadow-md">
            {models.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">
                无匹配结果
              </div>
            ) : (
              models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    onSelect(model.id);
                    setIsOpen(false);
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm hover:bg-accent transition flex items-center gap-2',
                    model.id === currentModelId && 'bg-accent',
                  )}
                >
                  {model.primaryImage ? (
                    <PhotoFrame
                      src={getImageUrl(model.primaryImage)}
                      alt={model.name}
                      className="h-6 rounded flex-shrink-0"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <Users className="w-3 h-3 text-muted-foreground" />
                    </div>
                  )}
                  <span className="truncate">{model.name}</span>
                  {model.gender && (
                    <span className="text-xs text-muted-foreground">
                      {GENDER_LABELS[model.gender]}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
