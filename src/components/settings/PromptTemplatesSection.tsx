/**
 * Prompt 模板管理区域
 * 支持创建、编辑、删除和切换默认模板
 */

'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Check, Edit3, Loader2 } from 'lucide-react';
import { getSetting, setSetting } from '@/lib/settings-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** 单个模板 */
interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  isDefault: boolean;
}

/** 存储结构 */
interface PromptTemplatesData {
  templates: PromptTemplate[];
}

const SETTINGS_KEY = 'prompt_templates';

/** 默认的儿童摄影模板 */
const DEFAULT_TEMPLATE: PromptTemplate = {
  id: 'default-child',
  name: '儿童摄影（默认）',
  content: `你是一位专业的儿童摄影师和创意导演，服务于消费级影楼。

## 工作室定位
- 业务类型：儿童摄影
- 目标客户：0-12岁儿童及其家庭
- 拍摄风格：自然、活泼、温馨，捕捉童真瞬间

## 拍摄要点
- 以儿童为主体，场景作为背景烘托氛围
- 动作要自然，善于引导孩子的真实表情
- 注意安全，避免危险动作
- 利用游戏、玩具引导自然表情

请根据以上定位，为客户提供专业的拍摄方案。`,
  isDefault: true,
};

export function PromptTemplatesSection() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', content: '' });

  // 加载模板
  useEffect(() => {
    async function load() {
      try {
        const data = await getSetting<PromptTemplatesData>(SETTINGS_KEY);
        if (data?.templates?.length) {
          setTemplates(data.templates);
        } else {
          // 初始化默认模板
          setTemplates([DEFAULT_TEMPLATE]);
        }
      } catch {
        setTemplates([DEFAULT_TEMPLATE]);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  // 保存模板
  const saveTemplates = async (newTemplates: PromptTemplate[]) => {
    setIsSaving(true);
    try {
      await setSetting(SETTINGS_KEY, { templates: newTemplates });
      setTemplates(newTemplates);
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  // 设为默认
  const handleSetDefault = (id: string) => {
    const newTemplates = templates.map(t => ({
      ...t,
      isDefault: t.id === id,
    }));
    saveTemplates(newTemplates);
  };

  // 删除模板
  const handleDelete = (id: string) => {
    const template = templates.find(t => t.id === id);
    if (!template) return;
    if (template.isDefault) {
      alert('不能删除默认模板，请先设置其他模板为默认');
      return;
    }
    if (!confirm(`确定要删除「${template.name}」吗？`)) return;
    saveTemplates(templates.filter(t => t.id !== id));
  };

  // 开始编辑
  const handleEdit = (template: PromptTemplate) => {
    setEditingId(template.id);
    setEditForm({ name: template.name, content: template.content });
  };

  // 保存编辑
  const handleSaveEdit = () => {
    if (!editingId) return;
    if (!editForm.name.trim() || !editForm.content.trim()) {
      alert('名称和内容不能为空');
      return;
    }
    const newTemplates = templates.map(t =>
      t.id === editingId
        ? { ...t, name: editForm.name.trim(), content: editForm.content.trim() }
        : t
    );
    saveTemplates(newTemplates);
    setEditingId(null);
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: '', content: '' });
  };

  // 新建模板
  const handleCreate = () => {
    const newId = `template-${Date.now()}`;
    const newTemplate: PromptTemplate = {
      id: newId,
      name: '新模板',
      content: '',
      isDefault: false,
    };
    setTemplates([...templates, newTemplate]);
    setEditingId(newId);
    setEditForm({ name: '新模板', content: '' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--ink-3)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--ink)] mb-1">系统提示词</h2>
        <p className="text-sm text-[var(--ink-2)]">
          管理系统提示词模板，生成预案时会使用改内容作为前置提示词
        </p>
      </div>

      {/* 模板列表 */}
      <div className="space-y-3">
        {templates.map(template => (
          <div
            key={template.id}
            className={cn(
              'rounded-xl border p-4 transition',
              template.isDefault
                ? 'border-primary/50 bg-primary/5'
                : 'border-[var(--line)] bg-white'
            )}
          >
            {editingId === template.id ? (
              // 编辑模式
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label>模板名称</Label>
                  <Input
                    value={editForm.name}
                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="如：儿童摄影、孕妇写真"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>模板内容</Label>
                  <Textarea
                    value={editForm.content}
                    onChange={e => setEditForm(f => ({ ...f, content: e.target.value }))}
                    placeholder="输入系统提示词内容..."
                    className="min-h-48 font-mono text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSaveEdit} disabled={isSaving}>
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    保存
                  </Button>
                  <Button variant="outline" onClick={handleCancelEdit}>
                    取消
                  </Button>
                </div>
              </div>
            ) : (
              // 展示模式
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--ink)]">{template.name}</span>
                    {template.isDefault && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-white">
                        默认
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {!template.isDefault && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleSetDefault(template.id)}
                        title="设为默认"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleEdit(template)}
                      title="编辑"
                    >
                      <Edit3 className="w-4 h-4" />
                    </Button>
                    {!template.isDefault && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleDelete(template.id)}
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-[var(--ink-2)] line-clamp-3 whitespace-pre-wrap">
                  {template.content || '（空内容）'}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 新建按钮 */}
      <button
        type="button"
        onClick={handleCreate}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-[var(--line)] text-sm font-medium text-[var(--ink-2)] hover:border-gray-400 hover:text-[var(--ink)] transition"
      >
        <Plus className="w-4 h-4" />
        新建模板
      </button>
    </div>
  );
}
