/**
 * 模型选择 Combobox
 * 支持从列表选择或手动输入模型名称
 */

import { useState, useRef, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ModelInfo, ModelCapability } from '@/types/provider';
import { getCapabilityIcon, getCapabilityColor } from '@/lib/providers/model-classifier';
import { cn } from '@/lib/utils';

interface ModelComboboxProps {
  value: string;
  onChange: (modelId: string) => void;
  models: ModelInfo[];
  filterCapability?: ModelCapability;
  placeholder?: string;
  disabled?: boolean;
}

export function ModelCombobox({
  value,
  onChange,
  models,
  filterCapability,
  placeholder = '输入或选择模型',
  disabled = false,
}: ModelComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 按能力过滤模型
  const filteredByCapability = useMemo(() => {
    if (!filterCapability) return models;
    return models.filter(m => m.capabilities.includes(filterCapability));
  }, [models, filterCapability]);

  // 按输入过滤模型
  const filteredModels = useMemo(() => {
    if (!value) return filteredByCapability;
    const lower = value.toLowerCase();
    return filteredByCapability.filter(m =>
      m.id.toLowerCase().includes(lower) ||
      m.name?.toLowerCase().includes(lower)
    );
  }, [filteredByCapability, value]);

  // 处理输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    if (filteredByCapability.length > 0) {
      setIsOpen(true);
    }
  };

  // 处理选择
  const handleSelect = (modelId: string) => {
    onChange(modelId);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  // 处理聚焦
  const handleFocus = () => {
    if (filteredByCapability.length > 0) {
      setIsOpen(true);
    }
  };

  // 当前选中的模型对象（用于显示能力标签）
  const selectedModel = models.find(m => m.id === value);

  return (
    <div className="relative">
      {/* 输入框 */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            'w-full rounded-xl border border-input bg-background px-4 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition',
            disabled && 'opacity-50 cursor-not-allowed',
            filteredByCapability.length > 0 && 'pr-10'
          )}
        />

        {/* 下拉图标 */}
        {filteredByCapability.length > 0 && (
          <button
            type="button"
            onClick={() => !disabled && setIsOpen(!isOpen)}
            disabled={disabled}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-accent transition"
          >
            <ChevronDown className={cn(
              'w-4 h-4 text-muted-foreground transition',
              isOpen && 'rotate-180'
            )} />
          </button>
        )}

        {/* 已选模型的能力标签 */}
        {selectedModel && selectedModel.capabilities.length > 0 && (
          <div className="absolute right-10 top-1/2 -translate-y-1/2 flex gap-1">
            {selectedModel.capabilities.slice(0, 2).map(cap => (
              <span
                key={cap}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getCapabilityColor(cap)}`}
              >
                {getCapabilityIcon(cap)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 下拉列表 */}
      {isOpen && filteredByCapability.length > 0 && (
        <>
          {/* 背景遮罩 */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* 列表 */}
          <div className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-lg/5">
            {filteredModels.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">
                没有匹配的模型，可直接使用输入的名称
              </div>
            ) : (
              filteredModels.map(model => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => handleSelect(model.id)}
                  className={cn(
                    'w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-accent transition',
                    model.id === value && 'bg-accent/50'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-foreground truncate">
                        {model.name || model.id}
                      </span>
                      {model.id === value && (
                        <span className="text-[10px] text-primary font-medium">✓</span>
                      )}
                    </div>
                    {model.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {model.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0 mt-0.5">
                    {model.capabilities.map(cap => (
                      <span
                        key={cap}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getCapabilityColor(cap)}`}
                        title={cap}
                      >
                        {getCapabilityIcon(cap)}
                      </span>
                    ))}
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
