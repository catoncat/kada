/**
 * 服务商卡片组件
 * 显示单个服务商信息，支持操作
 */

import { Star, Pencil, Trash2, Check, Server } from 'lucide-react';
import type { ProviderConfig } from '@/types/provider';
import { cn } from '@/lib/utils';

interface ProviderCardProps {
  provider: ProviderConfig;
  isDefault: boolean;
  onSetDefault: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ProviderCard({
  provider,
  isDefault,
  onSetDefault,
  onEdit,
  onDelete,
}: ProviderCardProps) {
  const formatLabel = provider.format === 'gemini' ? 'Gemini' : 'OpenAI';

  return (
    <div
      className={cn(
        'group relative rounded-xl border p-4 transition',
        isDefault
          ? 'border-primary bg-primary/5'
          : 'border-[var(--line)] bg-white hover:border-gray-300'
      )}
    >
      {/* 默认标记 */}
      {isDefault && (
        <div className="absolute -top-2 -right-2 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground">
          <Star className="w-3 h-3 fill-current" />
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* 图标 */}
        <div className={cn(
          'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
          isDefault ? 'bg-primary/20' : 'bg-gray-100'
        )}>
          <Server className={cn(
            'w-5 h-5',
            isDefault ? 'text-primary' : 'text-[var(--ink-2)]'
          )} />
        </div>

        {/* 信息 */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-[var(--ink)] truncate">
            {provider.name}
          </h3>
          <div className="mt-1 flex items-center gap-2 text-xs text-[var(--ink-3)]">
            <span className="px-1.5 py-0.5 rounded bg-gray-100 font-mono">
              {formatLabel}
            </span>
            {provider.textModel && (
              <span className="truncate max-w-[120px]" title={provider.textModel}>
                {provider.textModel}
              </span>
            )}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
          {!isDefault && (
            <button
              type="button"
              onClick={onSetDefault}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-[var(--ink-3)] hover:text-primary transition"
              title="设为默认"
            >
              <Check className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-[var(--ink-3)] hover:text-[var(--ink)] transition"
            title="编辑"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-red-50 text-[var(--ink-3)] hover:text-red-600 transition"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
