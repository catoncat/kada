'use client';

import { useEffect, useState } from 'react';
import {
  Settings,
  X,
  Key,
  ShieldCheck,
  Eye,
  EyeOff,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  TOPIC_EXAMPLES_STORAGE_KEY,
  defaultTopicExamples,
  validateTopicExamples,
} from '@/config/topics';
import type { ProviderConfig, ModelInfo, ApiFormat } from '@/types/provider';
import { BUILTIN_PROVIDERS, PRESET_TEMPLATES } from '@/types/provider';
import { getProviderConfig, saveProviderConfig } from '@/lib/provider-storage';
import { inferModelCapabilities } from '@/lib/providers/model-classifier';
import ModelSelector from './settings/model-selector';

type Mode = 'nano' | 'api';

export default function SettingsPanel() {
  const [isOpen, setIsOpen] = useState(false);

  // 运行模式
  const [mode, setMode] = useState<Mode>('nano');

  // Provider 配置
  const [providerId, setProviderId] = useState('local');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [format, setFormat] = useState<ApiFormat>('gemini');
  const [textModel, setTextModel] = useState('');
  const [imageModel, setImageModel] = useState('');
  const [showKey, setShowKey] = useState(false);

  // 模型列表
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  // 高级设置展开状态
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 示例主题
  const [topicExamplesDraft, setTopicExamplesDraft] = useState('');
  const [topicExamplesError, setTopicExamplesError] = useState<string | null>(null);
  const [topicExamplesSaved, setTopicExamplesSaved] = useState(false);

  // 初始化加载
  useEffect(() => {
    // 加载 Provider 配置
    const config = getProviderConfig();
    if (config) {
      setMode(config.format === 'local' ? 'nano' : 'api');
      setProviderId(config.id);
      setApiKey(config.apiKey);
      setBaseUrl(config.baseUrl);
      setFormat(config.format);
      setTextModel(config.textModel);
      setImageModel(config.imageModel);

      // 如果是自定义配置，展开高级设置
      if (!config.isPreset && config.format !== 'local') {
        setShowAdvanced(true);
      }
    }

    // 加载示例主题
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
    setTopicExamplesDraft(JSON.stringify(initial, null, 2));
  }, []);

  // 当选择预设 Provider 时，自动填充配置
  const handlePresetSelect = (preset: typeof PRESET_TEMPLATES[0]) => {
    setBaseUrl(preset.baseUrl);
    setFormat(preset.format);
    setTextModel(preset.textModel);
    setImageModel(preset.imageModel);
    setShowAdvanced(false);
    // 清空模型列表，等待用户获取
    setModels([]);
    setModelError(null);
  };

  // 获取模型列表
  const fetchModels = async () => {
    if (!apiKey) {
      setModelError('请先填写 API Key');
      return;
    }

    setLoadingModels(true);
    setModelError(null);

    try {
      const config: ProviderConfig = {
        id: providerId,
        name: '',
        format,
        baseUrl: baseUrl || (format === 'gemini'
          ? 'https://generativelanguage.googleapis.com/v1beta'
          : 'https://api.openai.com/v1'),
        apiKey,
        textModel,
        imageModel,
        isDefault: true,
      };

      const response = await fetch('/api/ai/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: config }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '获取模型列表失败');
      }

      // 为每个模型推断能力
      const modelsWithCaps = (data.models || []).map((m: any) => ({
        ...m,
        capabilities: inferModelCapabilities(m),
      }));

      setModels(modelsWithCaps);

      // 自动选择默认模型
      if (!textModel) {
        const textModels = modelsWithCaps.filter((m: ModelInfo) =>
          m.capabilities.includes('text') && !m.capabilities.includes('image')
        );
        if (textModels.length > 0) {
          setTextModel(textModels[0].id);
        }
      }

      if (!imageModel) {
        const imageModels = modelsWithCaps.filter((m: ModelInfo) =>
          m.capabilities.includes('image')
        );
        if (imageModels.length > 0) {
          setImageModel(imageModels[0].id);
        }
      }

    } catch (error: any) {
      setModelError(error.message);
    } finally {
      setLoadingModels(false);
    }
  };

  const resetTopicExamples = () => {
    localStorage.removeItem(TOPIC_EXAMPLES_STORAGE_KEY);
    setTopicExamplesDraft(JSON.stringify(defaultTopicExamples, null, 2));
    setTopicExamplesError(null);
    setTopicExamplesSaved(false);
  };

  const saveSettings = () => {
    if (mode === 'api') {
      // 保存 Provider 配置
      const config: ProviderConfig = {
        id: providerId,
        name: '自定义 API',
        format,
        baseUrl: baseUrl,
        apiKey,
        textModel,
        imageModel,
        isDefault: true,
      };
      saveProviderConfig(config);
    } else {
        // 保存本地模式配置
        const config: ProviderConfig = {
            ...BUILTIN_PROVIDERS[0],
            isDefault: true,
        };
        saveProviderConfig(config);
    }

    // 保存示例主题
    if (topicExamplesDraft.trim()) {
      try {
        const parsed = JSON.parse(topicExamplesDraft);
        const result = validateTopicExamples(parsed);
        if (!result.ok) {
          setTopicExamplesError(result.error);
          setTopicExamplesSaved(false);
          return;
        }
        localStorage.setItem(TOPIC_EXAMPLES_STORAGE_KEY, JSON.stringify(result.examples));
        setTopicExamplesError(null);
        setTopicExamplesSaved(true);
      } catch (e: any) {
        setTopicExamplesError(e?.message || '示例主题 JSON 解析失败');
        setTopicExamplesSaved(false);
        return;
      }
    }

    setIsOpen(false);
    window.location.reload();
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 rounded-full border border-[var(--line)] bg-white p-3 shadow-sm hover:bg-gray-50 transition"
        aria-label="打开设置"
      >
        <Settings className="w-6 h-6 text-[var(--ink-2)]" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-lg flex flex-col">
        <div className="flex items-center justify-between border-b border-[var(--line)] bg-white px-6 py-4 flex-shrink-0">
          <h2 className="text-base font-semibold text-[var(--ink)]">设置</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-full p-2 hover:bg-gray-100 transition"
            aria-label="关闭设置"
          >
            <X className="w-5 h-5 text-[var(--ink-2)]" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* 运行模式 */}
          <div>
            <label className="block text-sm font-medium text-[var(--ink)] mb-3">运行模式</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('nano')}
                className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                  mode === 'nano'
                    ? 'border-[var(--accent)] bg-[var(--accent)]/5 text-[var(--ink)]'
                    : 'border-[var(--line)] bg-white text-[var(--ink-2)] hover:bg-gray-50'
                }`}
              >
                本地模式
              </button>
              <button
                type="button"
                onClick={() => setMode('api')}
                className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                  mode === 'api'
                    ? 'border-[var(--accent)] bg-[var(--accent)]/5 text-[var(--ink)]'
                    : 'border-[var(--line)] bg-white text-[var(--ink-2)] hover:bg-gray-50'
                }`}
              >
                在线模式
              </button>
            </div>
            <p className="mt-2 text-xs text-[var(--ink-3)]">
              本地模式使用浏览器内置 AI；在线模式需要配置 API 提供商。
            </p>
          </div>

          {/* API 提供商配置 */}
          {mode === 'api' && (
            <div className="space-y-4">
              {/* 预设模板选择 */}
              <div>
                <label className="block text-sm font-medium text-[var(--ink)] mb-2">
                    快速配置
                </label>
                <div className="flex gap-2">
                    {PRESET_TEMPLATES.map((preset) => (
                        <button
                            key={preset.name}
                            type="button"
                            onClick={() => handlePresetSelect(preset)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--line)] hover:bg-gray-50 transition"
                        >
                            {preset.name}
                        </button>
                    ))}
                </div>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-[var(--ink)] mb-2 flex items-center">
                  <Key className="w-4 h-4 mr-2 text-[var(--ink-2)]" /> API Key
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="在此粘贴你的 API Key"
                    className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 pr-12 text-sm font-mono text-[var(--ink)] placeholder-[var(--ink-3)] focus:outline-none focus:ring-2 focus:ring-black/10"
                    style={{
                      color: '#000000',
                      backgroundColor: '#ffffff',
                      colorScheme: 'light',
                      WebkitTextFillColor: '#000000',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 hover:bg-gray-100 transition"
                    title={showKey ? '隐藏' : '显示'}
                  >
                    {showKey ? (
                      <EyeOff className="w-5 h-5 text-[var(--ink-2)]" />
                    ) : (
                      <Eye className="w-5 h-5 text-[var(--ink-2)]" />
                    )}
                  </button>
                </div>
              </div>

              {/* 获取模型列表按钮 */}
              <button
                type="button"
                onClick={fetchModels}
                disabled={loadingModels || !apiKey}
                className={`w-full flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition ${
                  loadingModels || !apiKey
                    ? 'border-[var(--line)] bg-gray-50 text-[var(--ink-3)] cursor-not-allowed'
                    : 'border-[var(--accent)] bg-[var(--accent)]/5 text-[var(--accent)] hover:bg-[var(--accent)]/10'
                }`}
              >
                <RefreshCw className={`w-4 h-4 ${loadingModels ? 'animate-spin' : ''}`} />
                {loadingModels ? '获取中...' : '获取模型列表'}
              </button>

              {modelError && (
                <p className="text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-200 flex items-start">
                  <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
                  {modelError}
                </p>
              )}

              {/* 模型选择 */}
              {models.length > 0 && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-[var(--ink)] mb-2">
                      文生文模型
                    </label>
                    <ModelSelector
                      value={textModel}
                      onChange={setTextModel}
                      models={models}
                      filterCapability="text"
                      placeholder="选择文生文模型"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--ink)] mb-2">
                      文生图模型
                    </label>
                    <ModelSelector
                      value={imageModel}
                      onChange={setImageModel}
                      models={models}
                      filterCapability="image"
                      placeholder="选择文生图模型"
                    />
                  </div>
                </div>
              )}

              {/* 高级设置 */}
              <div className="border-t border-[var(--line)] pt-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-2 text-sm font-medium text-[var(--ink-2)] hover:text-[var(--ink)] transition"
                >
                  {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  高级设置
                </button>

                {showAdvanced && (
                  <div className="mt-4 space-y-4">
                    {/* API 格式 */}
                    <div>
                      <label className="block text-sm font-medium text-[var(--ink)] mb-2">
                        API 格式
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setFormat('gemini')}
                          className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                            format === 'gemini'
                              ? 'border-[var(--accent)] bg-[var(--accent)]/5 text-[var(--ink)]'
                              : 'border-[var(--line)] bg-white text-[var(--ink-2)] hover:bg-gray-50'
                          }`}
                        >
                          Gemini 原生
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormat('openai')}
                          className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                            format === 'openai'
                              ? 'border-[var(--accent)] bg-[var(--accent)]/5 text-[var(--ink)]'
                              : 'border-[var(--line)] bg-white text-[var(--ink-2)] hover:bg-gray-50'
                          }`}
                        >
                          OpenAI 兼容
                        </button>
                      </div>
                    </div>

                    {/* Base URL */}
                    <div>
                      <label className="block text-sm font-medium text-[var(--ink)] mb-2">
                        Base URL
                      </label>
                      <input
                        type="text"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder={format === 'gemini'
                          ? 'https://generativelanguage.googleapis.com/v1beta'
                          : 'https://api.openai.com/v1'
                        }
                        className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-mono text-[var(--ink)] placeholder-[var(--ink-3)] focus:outline-none focus:ring-2 focus:ring-black/10"
                        style={{
                          color: '#000000',
                          backgroundColor: '#ffffff',
                          colorScheme: 'light',
                          WebkitTextFillColor: '#000000',
                        }}
                      />
                    </div>

                    {/* 手动输入模型名称 */}
                    <div>
                      <label className="block text-sm font-medium text-[var(--ink)] mb-2">
                        文生文模型（手动输入）
                      </label>
                      <input
                        type="text"
                        value={textModel}
                        onChange={(e) => setTextModel(e.target.value)}
                        placeholder="例如: gemini-2.5-flash"
                        className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-mono text-[var(--ink)] placeholder-[var(--ink-3)] focus:outline-none focus:ring-2 focus:ring-black/10"
                        style={{
                          color: '#000000',
                          backgroundColor: '#ffffff',
                          colorScheme: 'light',
                          WebkitTextFillColor: '#000000',
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[var(--ink)] mb-2">
                        文生图模型（手动输入）
                      </label>
                      <input
                        type="text"
                        value={imageModel}
                        onChange={(e) => setImageModel(e.target.value)}
                        placeholder="例如: gemini-3-pro-image"
                        className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-mono text-[var(--ink)] placeholder-[var(--ink-3)] focus:outline-none focus:ring-2 focus:ring-black/10"
                        style={{
                          color: '#000000',
                          backgroundColor: '#ffffff',
                          colorScheme: 'light',
                          WebkitTextFillColor: '#000000',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <p className="text-xs text-[var(--ink-2)] bg-gray-50 p-3 rounded-xl flex items-start border border-[var(--line)]">
                <ShieldCheck className="w-4 h-4 mr-2 flex-shrink-0 text-[var(--ink-2)]" />
                <span>
                  <b>隐私提示：</b>配置仅保存在你的浏览器本地。
                </span>
              </p>
            </div>
          )}

          {/* 示例主题 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-[var(--ink)]">示例主题（可编辑）</label>
              <button
                type="button"
                onClick={resetTopicExamples}
                className="text-xs font-medium text-[var(--ink-2)] hover:text-[var(--ink)] flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" /> 恢复默认
              </button>
            </div>

            <textarea
              value={topicExamplesDraft}
              onChange={(e) => {
                setTopicExamplesDraft(e.target.value);
                setTopicExamplesSaved(false);
                setTopicExamplesError(null);
              }}
              rows={5}
              className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-xs font-mono text-[var(--ink)] shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10"
              style={{
                color: '#000000',
                backgroundColor: '#ffffff',
                colorScheme: 'light',
                WebkitTextFillColor: '#000000',
              }}
              placeholder='["主题1", "主题2"]'
            />

            {topicExamplesError ? (
              <p className="text-xs text-red-700 bg-red-50 p-3 rounded-xl flex items-start border border-red-200">
                <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
                <span>{topicExamplesError}</span>
              </p>
            ) : topicExamplesSaved ? (
              <p className="text-xs text-green-700 bg-green-50 p-3 rounded-xl flex items-start border border-green-200">
                <CheckCircle2 className="w-4 h-4 mr-2 flex-shrink-0" />
                <span>示例主题已保存（刷新后生效）。</span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="p-6 border-t border-[var(--line)] flex-shrink-0">
          <button
            onClick={saveSettings}
            className="w-full rounded-xl bg-[var(--accent)] text-white py-3 font-semibold shadow-sm hover:opacity-95 transition"
          >
            保存并应用
          </button>
        </div>
      </div>
    </div>
  );
}
