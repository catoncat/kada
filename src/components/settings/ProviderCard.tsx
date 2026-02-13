/**
 * 服务商卡片组件
 * 显示单个服务商信息，支持操作
 */

import { Pencil, Trash2, Check, Server } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
        'rounded-xl border p-4 transition',
        isDefault
          ? 'border-primary/40 bg-primary/5'
          : 'border-border bg-card hover:border-ring/24 hover:bg-accent/30'
      )}
    >
      <div className="flex items-start gap-3">
        {/* 图标 */}
        <div className={cn(
          'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
          isDefault ? 'bg-primary/15' : 'bg-muted'
        )}>
          <Server className={cn(
            'w-5 h-5',
            isDefault ? 'text-primary' : 'text-muted-foreground'
          )} />
        </div>

        {/* 信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-medium text-foreground truncate">
              {provider.name}
            </h3>
            {isDefault && (
              <Badge className="rounded-full px-2 shrink-0" size="sm">
                默认
              </Badge>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="px-1.5 py-0.5 rounded bg-muted font-mono">
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
        <div className="flex items-center gap-1">
          {!isDefault && (
            <button
              type="button"
              onClick={onSetDefault}
              className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-primary transition"
              title="设为默认"
            >
              <Check className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition"
            title="编辑"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
