/**
 * PlanResultHeader - 方案结果页面头部
 * 展示版本信息、预览进度、批量操作按钮
 */

import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  FileDown,
  History,
  Images,
  Lightbulb,
  Loader2,
  MessageSquareQuote,
  Palette,
  Wand2,
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Project } from '@/types/project';
import type { GeneratedPlan, PreviewProgress } from './types';

export interface PlanResultHeaderProps {
  project: Project;
  plan: GeneratedPlan;
  /** 预览图生成进度 */
  previewProgress: PreviewProgress;
  /** 是否正在批量生成 */
  isBatchGenerating?: boolean;
  /** 是否正在重新生成方案 */
  isRegenerating?: boolean;
  /** 批量生成预览图回调 */
  onGeneratePreviews?: () => void;
  /** 打开版本历史回调 */
  onOpenVersions?: () => void;
  /** 重新生成方案回调 */
  onRegenerate?: () => void;
  /** 导出 PPT 回调 */
  onExportPPT?: () => void;
}

export function PlanResultHeader({
  project,
  plan,
  previewProgress,
  isBatchGenerating = false,
  isRegenerating = false,
  onGeneratePreviews,
  onOpenVersions,
  onRegenerate,
  onExportPPT,
}: PlanResultHeaderProps) {
  // 格式化创建时间
  const createdAt = project.createdAt
    ? new Date(project.createdAt).toLocaleDateString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <div className="space-y-4">
      {/* 顶部导航 */}
      <div className="flex items-center gap-4">
        <Link
          to="/"
          search={{ project: project.id }}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="w-4 h-4" />
          返回项目
        </Link>
      </div>

      {/* 标题行 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">
            {plan.title}
          </h1>
          <Badge variant="secondary">方案 v1</Badge>
          {createdAt && (
            <span className="text-sm text-muted-foreground">
              创建于 {createdAt}
            </span>
          )}
          <span className="text-sm text-muted-foreground">
            预览图: {previewProgress.done}/{previewProgress.total}
          </span>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={onOpenVersions}>
            <History className="w-4 h-4" />
            版本历史
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onGeneratePreviews}
            disabled={
              isBatchGenerating ||
              previewProgress.done === previewProgress.total
            }
          >
            {isBatchGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Images className="w-4 h-4" />
            )}
            批量生成预览
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRegenerate}
            disabled={isRegenerating}
          >
            {isRegenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            {isRegenerating ? '生成中...' : '重新生成'}
          </Button>
          <Button size="sm" onClick={onExportPPT}>
            <FileDown className="w-4 h-4" />
            导出 PPT
          </Button>
        </div>
      </div>

      {/* 预案概要 - 使用 Accordion */}
      <div className="rounded-xl border border-border bg-card">
        <Accordion defaultValue={['theme']}>
          <AccordionItem value="theme" className="px-5">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">主题</span>
                <span className="text-muted-foreground font-normal truncate max-w-[300px]">
                  {plan.theme}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-foreground pl-6">{plan.theme}</p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="creativeIdea" className="px-5">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">创意思路</span>
                <span className="text-muted-foreground font-normal truncate max-w-[300px]">
                  {plan.creativeIdea}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-foreground pl-6">{plan.creativeIdea}</p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="copywriting" className="px-5 border-b-0">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <MessageSquareQuote className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">核心文案</span>
                <span className="text-muted-foreground font-normal truncate max-w-[300px] italic">
                  "{plan.copywriting}"
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-foreground pl-6 italic">
                "{plan.copywriting}"
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
