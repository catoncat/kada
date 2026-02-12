'use client';

import { Edit2, Trash2, User, ImageIcon } from 'lucide-react';
import { getImageUrl } from '@/lib/scene-assets-api';
import type { ModelAsset } from '@/types/model-asset';

interface ModelCardProps {
  model: ModelAsset;
  onEdit?: () => void;
  onDelete?: () => void;
}

const GENDER_LABELS: Record<string, string> = {
  male: '男',
  female: '女',
  other: '其他',
};

export function ModelCard({ model, onEdit, onDelete }: ModelCardProps) {
  const ageLabel =
    model.ageRangeMin != null || model.ageRangeMax != null
      ? model.ageRangeMin != null && model.ageRangeMax != null
        ? `${model.ageRangeMin}-${model.ageRangeMax}岁`
        : model.ageRangeMin != null
          ? `${model.ageRangeMin}岁+`
          : `${model.ageRangeMax}岁以下`
      : null;

  const refCount =
    (model.primaryImage ? 1 : 0) + (model.referenceImages?.length ?? 0);

  return (
    <div className="rounded-2xl border border-border bg-card text-card-foreground overflow-hidden transition-all">
      {/* 图片区域 */}
      <div className="relative aspect-[4/3] bg-muted">
        {model.primaryImage ? (
          <img
            src={getImageUrl(model.primaryImage)}
            alt={model.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <User className="w-12 h-12 text-muted-foreground opacity-50" />
          </div>
        )}

        {/* 项目专属标签 */}
        {model.projectId && (
          <div className="absolute top-3 left-3 px-2 py-1 rounded-full bg-muted/90 text-xs font-medium text-muted-foreground">
            项目专属
          </div>
        )}

        {/* 参考图数量 */}
        {refCount > 0 && (
          <div className="absolute bottom-3 right-3 px-2 py-1 rounded-full bg-black/60 text-white text-xs flex items-center gap-1">
            <ImageIcon className="w-3 h-3" />
            {refCount}张参考图
          </div>
        )}
      </div>

      {/* 信息区域 */}
      <div className="p-4">
        <h3 className="text-base font-semibold text-foreground truncate">
          {model.name}
        </h3>

        {/* 性别/年龄标签 */}
        {(model.gender || ageLabel) && (
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            {model.gender && <span>{GENDER_LABELS[model.gender] || model.gender}</span>}
            {model.gender && ageLabel && <span>·</span>}
            {ageLabel && <span>{ageLabel}</span>}
          </div>
        )}

        {/* 外观提示词摘要 */}
        {model.appearancePrompt && (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
            {model.appearancePrompt}
          </p>
        )}

        {/* 标签 */}
        {model.tags && model.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {model.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
            {model.tags.length > 3 && (
              <span className="px-2 py-0.5 text-xs text-muted-foreground">
                +{model.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* 操作按钮 */}
        {(onEdit || onDelete) && (
          <div className="mt-4 flex items-center gap-2 pt-3 border-t border-border">
            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                aria-label={`编辑模特 ${model.name}`}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium text-foreground hover:bg-accent transition"
              >
                <Edit2 className="w-4 h-4" />
                编辑
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                aria-label={`删除模特 ${model.name}`}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition"
              >
                <Trash2 className="w-4 h-4" />
                删除
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
