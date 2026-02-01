'use client';

import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { ArrowLeft, FileDown, Loader2, Wand2, Camera, Lightbulb, MapPin, Image as ImageIcon } from 'lucide-react';
import { getProject, generatePlan } from '@/lib/projects-api';
import { getImageUrl } from '@/lib/scene-assets-api';

export const Route = createFileRoute('/project/$id/result')({
  component: ProjectResultPage,
});

interface GeneratedScene {
  location: string;
  description: string;
  shots: string;
  lighting: string;
  visualPrompt: string;
  sceneAssetId?: string;
  sceneAssetImage?: string;
  generatedImage?: string; // base64 图片
}

interface GeneratedPlan {
  title: string;
  theme: string;
  creativeIdea: string;
  copywriting: string;
  scenes: GeneratedScene[];
}

function ProjectResultPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [isRegenerating, setIsRegenerating] = useState(false);

  // 获取项目数据
  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => getProject(id),
  });

  // 重新生成 mutation
  const regenerateMutation = useMutation({
    mutationFn: () => generatePlan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    },
  });

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      await regenerateMutation.mutateAsync();
    } catch (err) {
      alert(err instanceof Error ? err.message : '重新生成失败');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleExportPPT = () => {
    // TODO: Phase 4 实现 PPT 导出
    alert('PPT 导出功能将在 Phase 4 实现');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[var(--primary)] animate-spin" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error instanceof Error ? error.message : '项目不存在'}
        </div>
      </div>
    );
  }

  const plan = project.generatedPlan as GeneratedPlan | null;

  // 未生成预案
  if (!plan) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 顶部导航 */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              to="/project/$id"
              params={{ id }}
              className="inline-flex items-center gap-2 text-sm text-[var(--ink-2)] hover:text-[var(--ink)] transition"
            >
              <ArrowLeft className="w-4 h-4" />
              返回项目
            </Link>
            <h1 className="text-2xl font-semibold text-[var(--ink)]">生成结果</h1>
          </div>
        </div>

        {/* 空状态 */}
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--paper-2)] flex items-center justify-center mb-4">
              <ImageIcon className="w-8 h-8 text-[var(--ink-3)]" />
            </div>
            <h3 className="text-lg font-medium text-[var(--ink)]">尚未生成预案</h3>
            <p className="mt-1 text-sm text-[var(--ink-2)] max-w-sm">
              请先完成项目配置，然后点击「生成预案」按钮
            </p>
            <Link
              to="/project/$id"
              params={{ id }}
              className="mt-6 inline-flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--paper-2)] transition"
            >
              返回配置
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link
            to="/project/$id"
            params={{ id }}
            className="inline-flex items-center gap-2 text-sm text-[var(--ink-2)] hover:text-[var(--ink)] transition"
          >
            <ArrowLeft className="w-4 h-4" />
            返回项目
          </Link>
          <h1 className="text-2xl font-semibold text-[var(--ink)]">{plan.title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--paper-2)] transition disabled:opacity-50"
          >
            {isRegenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            {isRegenerating ? '生成中...' : '重新生成'}
          </button>
          <button
            type="button"
            onClick={handleExportPPT}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition"
          >
            <FileDown className="w-4 h-4" />
            导出 PPT
          </button>
        </div>
      </div>

      {/* 预案概要 */}
      <div className="rounded-2xl border border-[var(--line)] bg-white p-6 mb-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-[var(--ink-3)] uppercase tracking-wide">主题</h3>
            <p className="mt-1 text-lg text-[var(--ink)]">{plan.theme}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-[var(--ink-3)] uppercase tracking-wide">创意思路</h3>
            <p className="mt-1 text-[var(--ink)]">{plan.creativeIdea}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-[var(--ink-3)] uppercase tracking-wide">核心文案</h3>
            <p className="mt-1 text-[var(--ink)] italic">"{plan.copywriting}"</p>
          </div>
        </div>
      </div>

      {/* 分镜列表 */}
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-[var(--ink)]">分镜场景 ({plan.scenes.length})</h2>

        {plan.scenes.map((scene, index) => (
          <div key={index} className="rounded-2xl border border-[var(--line)] bg-white overflow-hidden">
            <div className="flex flex-col md:flex-row">
              {/* 场景参考图 */}
              <div className="w-full md:w-1/3 aspect-video md:aspect-square bg-[var(--paper-2)] flex-shrink-0">
                {scene.sceneAssetImage ? (
                  <img
                    src={getImageUrl(scene.sceneAssetImage)}
                    alt={scene.location}
                    className="w-full h-full object-cover"
                  />
                ) : scene.generatedImage ? (
                  <img
                    src={`data:image/png;base64,${scene.generatedImage}`}
                    alt={scene.location}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-12 h-12 text-[var(--ink-3)]" />
                  </div>
                )}
              </div>

              {/* 场景详情 */}
              <div className="flex-1 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--primary)] text-white text-xs font-medium">
                    {index + 1}
                  </span>
                  <h3 className="text-lg font-semibold text-[var(--ink)]">{scene.location}</h3>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-[var(--ink-3)] mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-[var(--ink-3)]">内容描述：</span>
                      <span className="text-[var(--ink)]">{scene.description}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Camera className="w-4 h-4 text-[var(--ink-3)] mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-[var(--ink-3)]">拍摄建议：</span>
                      <span className="text-[var(--ink)]">{scene.shots}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Lightbulb className="w-4 h-4 text-[var(--ink-3)] mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-[var(--ink-3)]">灯光布置：</span>
                      <span className="text-[var(--ink)]">{scene.lighting}</span>
                    </div>
                  </div>
                </div>

                {/* Visual Prompt (可折叠) */}
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-[var(--primary)] hover:underline">
                    查看 AI 提示词
                  </summary>
                  <div className="mt-2 p-3 rounded-lg bg-[var(--paper-2)] text-xs text-[var(--ink-2)] font-mono whitespace-pre-wrap">
                    {scene.visualPrompt}
                  </div>
                </details>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
