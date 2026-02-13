'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ImageIcon, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { SceneForm } from '@/components/assets/SceneForm';
import { SceneListItem } from '@/components/assets/SceneListItem';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createSceneAsset,
  deleteSceneAsset,
  getSceneAssets,
  updateSceneAsset,
} from '@/lib/scene-assets-api';
import type { CreateSceneAssetInput, SceneAsset } from '@/types/scene-asset';

interface ScenesSearchParams {
  action?: 'create';
}

type PanelMode = 'empty' | 'detail' | 'create';

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

  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>('empty');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SceneAsset | null>(null);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    if (action === 'create') {
      setSelectedSceneId(null);
      setPanelMode('create');
      navigate({ to: '/assets/scenes', search: {}, replace: true });
    }
  }, [action, navigate]);

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['sceneAssets'],
    queryFn: getSceneAssets,
  });

  const scenes = data?.data || [];

  const filteredScenes = useMemo(() => {
    if (!search.trim()) return scenes;
    const q = search.toLowerCase();
    return scenes.filter((scene) => {
      return (
        scene.name.toLowerCase().includes(q) ||
        scene.description?.toLowerCase().includes(q) ||
        scene.defaultLighting?.toLowerCase().includes(q) ||
        scene.tags?.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [scenes, search]);

  const selectedScene = scenes.find((scene) => scene.id === selectedSceneId) ?? null;

  useEffect(() => {
    if (panelMode === 'create' || isLoading) return;

    if (!selectedSceneId && scenes.length > 0) {
      setSelectedSceneId(scenes[0].id);
      setPanelMode('detail');
      return;
    }

    if (selectedSceneId && !selectedScene && scenes.length > 0) {
      setSelectedSceneId(scenes[0].id);
      setPanelMode('detail');
      return;
    }

    if (scenes.length === 0) {
      setSelectedSceneId(null);
      setPanelMode('empty');
    }
  }, [isLoading, panelMode, scenes, selectedScene, selectedSceneId]);

  const createMutation = useMutation({
    mutationFn: createSceneAsset,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['sceneAssets'] });
      setSelectedSceneId(created.id);
      setPanelMode('detail');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateSceneAssetInput }) =>
      updateSceneAsset(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sceneAssets'] });
      setResetKey((k) => k + 1);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSceneAsset,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sceneAssets'] });
      if (deleteTarget?.id === selectedSceneId) {
        setSelectedSceneId(null);
        setPanelMode('empty');
      }
      setDeleteTarget(null);
    },
  });

  const handleCreate = () => {
    setSelectedSceneId(null);
    setPanelMode('create');
  };

  const handleSelect = (id: string) => {
    setSelectedSceneId(id);
    setPanelMode('detail');
  };

  const handleSubmitCreate = async (formData: CreateSceneAssetInput) => {
    await createMutation.mutateAsync(formData);
  };

  const handleSubmitEdit = async (formData: CreateSceneAssetInput) => {
    if (!selectedSceneId) return;
    await updateMutation.mutateAsync({ id: selectedSceneId, data: formData });
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const listPanel = (
    <ThreeColumnListPane>
      <div className="p-3">
        <Button
          onClick={handleCreate}
          className="w-full justify-center"
          size="sm"
          variant="outline"
        >
          <Plus className="h-4 w-4" />
          新建场景
        </Button>
      </div>

      {scenes.length > 0 && (
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索场景..."
              className="bg-muted/50 pl-8"
              size="sm"
            />
          </div>
        </div>
      )}

      {scenes.length > 0 && <div className="mx-3 border-t" />}

      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
        onWheel={(e) => e.stopPropagation()}
      >
        {isLoading && (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            正在加载场景...
          </div>
        )}

        {!isLoading && error && (
          <div className="px-3 py-3">
            <Alert variant="error">
              <AlertTitle>加载失败</AlertTitle>
              <AlertDescription className="mt-2">
                <p>{error instanceof Error ? error.message : '场景列表加载失败'}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => refetch()}
                  className="mt-2"
                >
                  重试
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {!isLoading && !error && scenes.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            还没有场景，点击上方按钮创建
          </div>
        )}

        {!isLoading && !error && scenes.length > 0 && filteredScenes.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            没有匹配的场景
          </div>
        )}

        {!isLoading && !error && filteredScenes.length > 0 && (
          <div className="px-2 py-1">
            {filteredScenes.map((scene) => (
              <SceneListItem
                key={scene.id}
                scene={scene}
                selected={scene.id === selectedSceneId}
                onSelect={() => handleSelect(scene.id)}
                onDelete={() => setDeleteTarget(scene)}
              />
            ))}
          </div>
        )}
      </div>
    </ThreeColumnListPane>
  );

  const detailPanel = (
    <ThreeColumnDetailPane>
      {panelMode === 'empty' && !error && (
        <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
          <ImageIcon className="mb-4 h-16 w-16 opacity-30" />
          <p className="text-sm">选择一个场景查看详情</p>
          <p className="mt-1 text-xs opacity-60">或点击「新建场景」创建</p>
        </div>
      )}

      {panelMode === 'create' && (
        <SceneForm
          key="__create__"
          onSubmit={handleSubmitCreate}
          onCancel={() => setPanelMode(selectedSceneId ? 'detail' : 'empty')}
          loading={createMutation.isPending}
        />
      )}

      {panelMode === 'detail' && selectedScene && (
        <SceneForm
          key={`${selectedScene.id}:${resetKey}`}
          initialData={selectedScene}
          onSubmit={handleSubmitEdit}
          onDelete={() => setDeleteTarget(selectedScene)}
          loading={isSubmitting}
        />
      )}

      {error && panelMode !== 'create' && (
        <div className="mx-auto max-w-xl px-6 py-10">
          <Alert variant="error">
            <AlertTitle>场景模块暂不可用</AlertTitle>
            <AlertDescription className="mt-2 space-y-3">
              <p>{error instanceof Error ? error.message : '请求失败'}</p>
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                重新加载
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}
    </ThreeColumnDetailPane>
  );

  return (
    <>
      <ThreeColumnLayout
        preset={THREE_COLUMN_PRESETS.assetsScenes}
        resizeAriaLabel="调整场景列表宽度"
        list={listPanel}
        detail={detailPanel}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogPopup className="p-0">
          <AlertDialogHeader>
            <AlertDialogTitle>删除场景</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除场景「{deleteTarget?.name}」吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              取消
            </AlertDialogClose>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending ? '删除中...' : '删除'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
