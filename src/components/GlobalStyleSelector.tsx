'use client';

import type { GlobalStyle } from '@/types/project-plan';
import { Palette } from 'lucide-react';

interface GlobalStyleSelectorProps {
  style: GlobalStyle;
  onChange: (style: GlobalStyle) => void;
}

export default function GlobalStyleSelector({ style, onChange }: GlobalStyleSelectorProps) {
  return (
    <div className="space-y-4 rounded-[var(--radius-2xl)] border border-[var(--line)] bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Palette className="w-5 h-5 text-primary" />
        <h3 className="text-base font-semibold text-[var(--ink)]">全局风格锚点</h3>
      </div>
      
      <p className="text-xs text-[var(--ink-3)]">
        设置统一的风格调性，确保所有场景的 visualPrompt 保持一致的视觉风格
      </p>

      <div className="grid gap-4">
        {/* Color Tone */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-[var(--ink)]">色调</label>
          <div className="grid grid-cols-3 gap-2">
            {(['warm', 'cool', 'neutral'] as const).map((tone) => (
              <button
                key={tone}
                type="button"
                onClick={() => onChange({ ...style, colorTone: tone })}
                className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                  style.colorTone === tone
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-[var(--line)] bg-white text-[var(--ink)] hover:bg-gray-50'
                }`}
              >
                {tone === 'warm' ? '暖色调' : tone === 'cool' ? '冷色调' : '中性色'}
              </button>
            ))}
          </div>
        </div>

        {/* Lighting Mood */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-[var(--ink)]">光线氛围</label>
          <div className="grid grid-cols-3 gap-2">
            {(['soft', 'dramatic', 'natural'] as const).map((mood) => (
              <button
                key={mood}
                type="button"
                onClick={() => onChange({ ...style, lightingMood: mood })}
                className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                  style.lightingMood === mood
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-[var(--line)] bg-white text-[var(--ink)] hover:bg-gray-50'
                }`}
              >
                {mood === 'soft' ? '柔光' : mood === 'dramatic' ? '戏剧性' : '自然光'}
              </button>
            ))}
          </div>
        </div>

        {/* Era */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-[var(--ink)]">时代感</label>
          <div className="grid grid-cols-3 gap-2">
            {(['modern', 'vintage', 'timeless'] as const).map((era) => (
              <button
                key={era}
                type="button"
                onClick={() => onChange({ ...style, era })}
                className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                  style.era === era
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-[var(--line)] bg-white text-[var(--ink)] hover:bg-gray-50'
                }`}
              >
                {era === 'modern' ? '现代' : era === 'vintage' ? '复古' : '永恒'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-[var(--paper-2)] p-3 text-xs text-[var(--ink-2)]">
        <strong>当前风格预览：</strong>
        <span className="ml-1">
          {style.colorTone === 'warm' ? '暖色调' : style.colorTone === 'cool' ? '冷色调' : '中性色'}
          {' + '}
          {style.lightingMood === 'soft' ? '柔光' : style.lightingMood === 'dramatic' ? '戏剧性光线' : '自然光'}
          {' + '}
          {style.era === 'modern' ? '现代感' : style.era === 'vintage' ? '复古感' : '永恒感'}
        </span>
      </div>
    </div>
  );
}
