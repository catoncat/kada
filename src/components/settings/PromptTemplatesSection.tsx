/**
 * Prompt 模板管理区域
 * 支持创建、编辑、删除和切换默认模板
 */

'use client';

import { Check, Edit3, Loader2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getSetting, setSetting } from '@/lib/settings-api';
import { cn } from '@/lib/utils';

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  isDefault: boolean;
}

interface PromptTemplatesData {
  templates: PromptTemplate[];
}

const SETTINGS_KEY = 'prompt_templates';

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
  const [deleteTarget, setDeleteTarget] = useState<PromptTemplate | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sectionHeader = (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-foreground">系统提示词</h2>
      <p className="text-sm text-muted-foreground">
        管理全局工作室提示词。它会作为固定编排的第一段输入，参与出图预览、实际出图与方案生成。
      </p>
    </div>
  );

  useEffect(() => {
    async function load() {
      try {
        const data = await getSetting<PromptTemplatesData>(SETTINGS_KEY);
        if (data?.templates?.length) {
          setTemplates(data.templates);
        } else {
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

  const saveTemplates = async (nextTemplates: PromptTemplate[]) => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await setSetting(SETTINGS_KEY, { templates: nextTemplates });
      setTemplates(nextTemplates);
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存失败');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetDefault = (id: string) => {
    const nextTemplates = templates.map((template) => ({
      ...template,
      isDefault: template.id === id,
    }));
    void saveTemplates(nextTemplates);
  };

  const handleDelete = (id: string) => {
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    if (template.isDefault) {
      setErrorMessage('不能删除默认模板，请先设置其他模板为默认');
      return;
    }
    setErrorMessage(null);
    setDeleteTarget(template);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const succeeded = await saveTemplates(
      templates.filter((template) => template.id !== deleteTarget.id),
    );
    if (succeeded) {
      setDeleteTarget(null);
    }
  };

  const handleEdit = (template: PromptTemplate) => {
    setEditingId(template.id);
    setEditForm({ name: template.name, content: template.content });
    setErrorMessage(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    if (!editForm.name.trim() || !editForm.content.trim()) {
      setErrorMessage('名称和内容不能为空');
      return;
    }

    const nextTemplates = templates.map((template) =>
      template.id === editingId
        ? {
            ...template,
            name: editForm.name.trim(),
            content: editForm.content.trim(),
          }
        : template,
    );

    const succeeded = await saveTemplates(nextTemplates);
    if (succeeded) {
      setEditingId(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: '', content: '' });
    setErrorMessage(null);
  };

  const handleCreate = () => {
    setErrorMessage(null);
    const newId = `template-${Date.now()}`;
    const newTemplate: PromptTemplate = {
      id: newId,
      name: '新模板',
      content: '',
      isDefault: false,
    };

    setTemplates((prev) => [...prev, newTemplate]);
    setEditingId(newId);
    setEditForm({ name: '新模板', content: '' });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {sectionHeader}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">加载模板中...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sectionHeader}

      {errorMessage && (
        <Alert variant="error">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        {templates.map((template) => (
          <div
            key={template.id}
            className={cn(
              'rounded-xl border p-4 transition',
              template.isDefault
                ? 'border-primary/40 bg-primary/5'
                : 'border-border bg-card',
            )}
          >
            {editingId === template.id ? (
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label>模板名称</Label>
                  <Input
                    value={editForm.name}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    placeholder="如：儿童摄影、孕妇写真"
                  />
                </div>

                <div className="grid gap-2">
                  <Label>模板内容</Label>
                  <Textarea
                    value={editForm.content}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        content: event.target.value,
                      }))
                    }
                    placeholder="输入系统提示词内容..."
                    className="min-h-48 font-mono text-sm"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => void handleSaveEdit()}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    保存
                  </Button>
                  <Button variant="outline" onClick={handleCancelEdit}>
                    取消
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {template.name}
                      </span>
                      {template.isDefault && (
                        <Badge className="rounded-full px-2" size="sm">
                          默认
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {!template.isDefault && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleSetDefault(template.id)}
                        title="设为默认"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleEdit(template)}
                      title="编辑"
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    {!template.isDefault && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleDelete(template.id)}
                        title="删除"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>

                <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                  {template.content || '（空内容）'}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <Button
        className="w-full justify-center gap-2 rounded-xl border-dashed"
        onClick={handleCreate}
        size="lg"
        variant="outline"
      >
        <Plus className="h-4 w-4" />
        新建模板
      </Button>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogPopup className="p-0">
          <AlertDialogHeader>
            <AlertDialogTitle>删除模板</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deleteTarget?.name}」吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              取消
            </AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmDelete()}
              disabled={isSaving}
            >
              {isSaving ? '删除中...' : '删除'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}
