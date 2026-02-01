import { useState } from 'react';
import type { ModelInfo, ModelCapability } from '@/types/provider';
import { ChevronDown, Loader2 } from 'lucide-react';
import { getCapabilityIcon, getCapabilityColor } from '@/lib/providers/model-classifier';

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  models: ModelInfo[];
  loading?: boolean;
  filterCapability?: ModelCapability;
  placeholder?: string;
  disabled?: boolean;
}

export default function ModelSelector({
  value,
  onChange,
  models,
  loading = false,
  filterCapability,
  placeholder = '选择模型',
  disabled = false,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  // 过滤模型
  const filteredModels = filterCapability
    ? models.filter(m => m.capabilities.includes(filterCapability))
    : models;

  // 当前选中的模型
  const selectedModel = models.find(m => m.id === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !disabled && !loading && setIsOpen(!isOpen)}
        disabled={disabled || loading}
        className={`w-full flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-left text-sm transition ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-[var(--ink-3)]" />
              <span className="text-[var(--ink-3)]">加载中...</span>
            </>
          ) : selectedModel ? (
            <>
              <span className="font-mono text-[var(--ink)] truncate">{selectedModel.name}</span>
              <div className="flex gap-1 flex-shrink-0">
                {selectedModel.capabilities.slice(0, 2).map(cap => (
                  <span
                    key={cap}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getCapabilityColor(cap)}`}
                  >
                    {getCapabilityIcon(cap)}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <span className="text-[var(--ink-3)]">{placeholder}</span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-[var(--ink-3)] transition ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* 下拉列表 */}
          <div className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-xl border border-[var(--line)] bg-white shadow-lg">
            {filteredModels.length === 0 ? (
              <div className="px-4 py-3 text-sm text-[var(--ink-3)]">
                {filterCapability ? `没有支持 ${filterCapability} 的模型` : '没有可用模型'}
              </div>
            ) : (
              filteredModels.map(model => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    onChange(model.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition ${
                    model.id === value ? 'bg-gray-50' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-[var(--ink)] truncate">
                        {model.name}
                      </span>
                      {model.id === value && (
                        <span className="text-[10px] text-[var(--accent)] font-medium">✓</span>
                      )}
                    </div>
                    {model.description && (
                      <p className="text-xs text-[var(--ink-3)] truncate mt-0.5">
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

// 简单的输入框版本（用于手动输入模型名称）
export function ModelInput({
  value,
  onChange,
  placeholder = '输入模型名称',
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-mono text-[var(--ink)] placeholder-[var(--ink-3)] focus:outline-none focus:ring-2 focus:ring-black/10 disabled:opacity-50"
      style={{
        color: '#000000',
        backgroundColor: '#ffffff',
        colorScheme: 'light',
        WebkitTextFillColor: '#000000',
      }}
    />
  );
}
