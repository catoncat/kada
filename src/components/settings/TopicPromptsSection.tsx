/**
 * 主题提示词编辑区域
 * 从现有 SettingsPanel 提取的主题编辑逻辑
 */

import { useState, useEffect } from 'react';
import { RotateCcw, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import {
  TOPIC_EXAMPLES_STORAGE_KEY,
  defaultTopicExamples,
  validateTopicExamples,
} from '@/config/topics';

interface TopicPromptsSectionProps {
  onSaveSuccess?: () => void;
}

export function TopicPromptsSection({ onSaveSuccess }: TopicPromptsSectionProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // 初始化加载
  useEffect(() => {
    const rawTopics = localStorage.getItem(TOPIC_EXAMPLES_STORAGE_KEY);
    let initial = defaultTopicExamples;
    if (rawTopics) {
      try {
        const parsed = JSON.parse(rawTopics);
        const result = validateTopicExamples(parsed);
        if (result.ok) initial = result.examples;
      } catch {
        // ignore
      }
    }
    setDraft(JSON.stringify(initial, null, 2));
  }, []);

  // 恢复默认
  const handleReset = () => {
    localStorage.removeItem(TOPIC_EXAMPLES_STORAGE_KEY);
    setDraft(JSON.stringify(defaultTopicExamples, null, 2));
    setError(null);
    setSaved(false);
  };

  // 保存
  const handleSave = () => {
    if (!draft.trim()) {
      setError('内容不能为空');
      return;
    }

    try {
      const parsed = JSON.parse(draft);
      const result = validateTopicExamples(parsed);
      if (!result.ok) {
        setError(result.error);
        setSaved(false);
        return;
      }
      localStorage.setItem(TOPIC_EXAMPLES_STORAGE_KEY, JSON.stringify(result.examples));
      setError(null);
      setSaved(true);
      onSaveSuccess?.();
    } catch (e: any) {
      setError(e?.message || 'JSON 解析失败');
      setSaved(false);
    }
  };

  // 输入变化
  const handleChange = (value: string) => {
    setDraft(value);
    setSaved(false);
    setError(null);
  };

  return (
    <div className="space-y-4">
      {/* 标题和操作 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h3 className="text-base font-semibold text-[var(--ink)]">主题提示词</h3>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="text-xs font-medium text-[var(--ink-2)] hover:text-[var(--ink)] flex items-center gap-1 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" /> 恢复默认
        </button>
      </div>

      <p className="text-sm text-[var(--ink-2)]">
        这些主题会显示在首页作为快速选择的示例。编辑下方的 JSON 数组来自定义。
      </p>

      {/* 编辑器 */}
      <textarea
        value={draft}
        onChange={e => handleChange(e.target.value)}
        rows={12}
        className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-xs font-mono text-[var(--ink)] shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10 resize-none"
        placeholder='["主题1", "主题2"]'
      />

      {/* 错误/成功提示 */}
      {error && (
        <p className="text-xs text-red-700 bg-red-50 p-3 rounded-xl flex items-start border border-red-200">
          <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {saved && !error && (
        <p className="text-xs text-green-700 bg-green-50 p-3 rounded-xl flex items-start border border-green-200">
          <CheckCircle2 className="w-4 h-4 mr-2 flex-shrink-0" />
          <span>主题已保存（刷新页面后生效）</span>
        </p>
      )}

      {/* 保存按钮 */}
      <button
        type="button"
        onClick={handleSave}
        className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-semibold shadow-sm hover:opacity-95 transition"
      >
        保存主题
      </button>
    </div>
  );
}
