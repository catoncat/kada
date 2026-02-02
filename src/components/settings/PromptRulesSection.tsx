/**
 * Prompt 编排规则管理
 * - 规则会影响服务端生成 effectivePrompt 的拼接顺序与包含内容
 * - 规则存储在 settings.key = "prompt_rules"
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, RotateCcw, Save, Loader2 } from 'lucide-react';

import { getSetting, setSetting } from '@/lib/settings-api';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import {
  DEFAULT_PROMPT_RULES_V1,
  type PromptRuleKey,
  type PromptRulesV1,
  type PromptBlockV1,
} from '@/types/prompt-rules';

const SETTINGS_KEY = 'prompt_rules';

const RULE_TABS: Array<{ key: PromptRuleKey; label: string; desc: string }> = [
  {
    key: 'image-generation:planScene',
    label: '项目分镜出图',
    desc: '用于“结果页分镜场景预览图 / 场景编辑抽屉”的文生图与图生图。',
  },
  {
    key: 'image-generation:asset',
    label: '场景资产出图',
    desc: '用于资产库里对“场景资产”生成/编辑图片。',
  },
];

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function PromptRulesSection() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeKey, setActiveKey] = useState<PromptRuleKey>('image-generation:planScene');
  const [rules, setRules] = useState<PromptRulesV1>(DEFAULT_PROMPT_RULES_V1);
  const [savedSnapshot, setSavedSnapshot] = useState<string>('');

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const data = await getSetting<PromptRulesV1>(SETTINGS_KEY);
        const next = data?.version === 1 && data.rules ? data : DEFAULT_PROMPT_RULES_V1;
        setRules(next);
        setSavedSnapshot(JSON.stringify(next));
      } catch {
        setRules(DEFAULT_PROMPT_RULES_V1);
        setSavedSnapshot(JSON.stringify(DEFAULT_PROMPT_RULES_V1));
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const currentRule = rules.rules[activeKey];
  const isDirty = useMemo(() => JSON.stringify(rules) !== savedSnapshot, [rules, savedSnapshot]);

  const updateCurrentBlocks = (updater: (blocks: PromptBlockV1[]) => PromptBlockV1[]) => {
    setRules((prev) => {
      const next = clone(prev);
      next.rules[activeKey].blocks = updater(next.rules[activeKey].blocks);
      return next;
    });
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    updateCurrentBlocks((blocks) => {
      const target = index + direction;
      if (target < 0 || target >= blocks.length) return blocks;
      const next = [...blocks];
      const tmp = next[index];
      next[index] = next[target];
      next[target] = tmp;
      return next;
    });
  };

  const toggleBlock = (index: number, enabled: boolean) => {
    updateCurrentBlocks((blocks) =>
      blocks.map((b, i) => (i === index ? { ...b, enabled } : b)),
    );
  };

  const updateFreeText = (index: number, content: string) => {
    updateCurrentBlocks((blocks) =>
      blocks.map((b, i) => (i === index ? { ...b, content } : b)),
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await setSetting(SETTINGS_KEY, rules);
      setSavedSnapshot(JSON.stringify(rules));
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (!confirm('确定要重置为默认规则吗？这会覆盖你当前的修改。')) return;
    const next = clone(DEFAULT_PROMPT_RULES_V1);
    setRules(next);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <span className="ml-2 text-sm">加载中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div>
        <h3 className="text-base font-semibold text-[var(--ink)]">提示词编排</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          这里管理“服务端如何把全局/项目/客户/场景等上下文拼成 effectivePrompt”。保存后会立即影响后续生成。
        </p>
      </div>

      {/* Tabs + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {RULE_TABS.map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={activeKey === t.key ? 'default' : 'outline'}
              onClick={() => setActiveKey(t.key)}
            >
              {t.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleReset}
            disabled={isSaving}
          >
            <RotateCcw className="size-4" />
            重置默认
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!isDirty || isSaving}>
            {isSaving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            保存
          </Button>
        </div>
      </div>

      {/* 描述 */}
      <div className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
        {RULE_TABS.find((t) => t.key === activeKey)?.desc}
      </div>

      {/* Blocks */}
      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="font-medium truncate">{currentRule?.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Rule ID: {currentRule?.id}
              </div>
            </div>
            {isDirty && (
              <span className="text-xs text-primary">未保存</span>
            )}
          </div>
        </div>

        <div className="divide-y">
          {currentRule.blocks.map((b, index) => {
            const canUp = index > 0;
            const canDown = index < currentRule.blocks.length - 1;
            const isFreeText = b.kind === 'freeText';

            return (
              <div key={b.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className={cn('text-sm font-medium', !b.enabled && 'opacity-60')}>
                        {b.label}
                      </div>
                      <span className="text-xs text-muted-foreground">({b.kind})</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={b.enabled}
                      onCheckedChange={(checked) => toggleBlock(index, !!checked)}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={!canUp}
                      onClick={() => moveBlock(index, -1)}
                      title="上移"
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={!canDown}
                      onClick={() => moveBlock(index, 1)}
                      title="下移"
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                  </div>
                </div>

                {isFreeText && (
                  <div className="mt-3">
                    <Textarea
                      value={b.content || ''}
                      onChange={(e) => updateFreeText(index, e.target.value)}
                      rows={4}
                      placeholder="输入要插入到 prompt 的固定文本..."
                      className="resize-none"
                    />
                  </div>
                )}

                {!b.enabled && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    已禁用：该段不会参与 effectivePrompt 拼接
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-xs text-muted-foreground leading-relaxed">
        <div>提示：</div>
        <ul className="list-disc pl-4 space-y-1">
          <li>出图实际使用的 effectivePrompt 由服务端回显为准（可追溯）。</li>
          <li>项目提示词可在项目工作区编辑；全局工作室提示词在“系统提示词”里管理。</li>
        </ul>
      </div>
    </div>
  );
}

