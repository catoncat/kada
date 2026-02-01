'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, History } from 'lucide-react';
import {
  TOPIC_EXAMPLES_STORAGE_KEY,
  defaultTopicExamples,
  validateTopicExamples,
} from '@/config/topics';

const STORAGE_KEY = 'shooting_recent_topics_v1';

function loadTopicExamplesFromStorage(): string[] {
  if (typeof window === 'undefined') return defaultTopicExamples;

  try {
    const raw = localStorage.getItem(TOPIC_EXAMPLES_STORAGE_KEY);
    if (!raw) return defaultTopicExamples;

    const parsed = JSON.parse(raw);
    const result = validateTopicExamples(parsed);
    if (!result.ok) return defaultTopicExamples;
    return result.examples;
  } catch {
    return defaultTopicExamples;
  }
}

export function saveRecentTopic(topic: string) {
  const t = topic.trim();
  if (!t) return;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const prev: string[] = raw ? JSON.parse(raw) : [];
    const next = [t, ...prev.filter((x) => x !== t)].slice(0, 8);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export default function TopicChips({
  onPick,
  examples,
}: {
  onPick: (topic: string) => void;
  examples?: string[];
}) {
  const [recent, setRecent] = useState<string[]>([]);
  const [storedExamples, setStoredExamples] = useState<string[]>(defaultTopicExamples);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setRecent(JSON.parse(raw));
    } catch {
      // ignore
    }

    setStoredExamples(loadTopicExamplesFromStorage());

    const onStorage = (e: StorageEvent) => {
      if (e.key === TOPIC_EXAMPLES_STORAGE_KEY) {
        setStoredExamples(loadTopicExamplesFromStorage());
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const items = useMemo(() => {
    const ex = (examples ?? storedExamples).slice(0, 10);
    return {
      recent: recent.slice(0, 6),
      examples: ex,
    };
  }, [recent, examples, storedExamples]);

  const Chip = ({
    label,
    icon,
  }: {
    label: string;
    icon?: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={() => onPick(label)}
      className="group inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm text-[var(--ink)] shadow-sm transition hover:bg-gray-50"
    >
      {icon}
      <span className="max-w-[22rem] truncate">{label}</span>
      <ArrowUpRight className="w-4 h-4 text-[var(--ink-3)] opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );

  return (
    <div className="space-y-6">
      {items.recent.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.28em] uppercase text-[var(--ink-3)]">
            <History className="w-3.5 h-3.5" /> 最近使用
          </div>
          <div className="flex flex-wrap gap-2">
            {items.recent.map((t) => (
              <Chip key={t} label={t} />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-[var(--ink-3)]">
          示例主题
        </div>
        <div className="flex flex-wrap gap-2">
          {items.examples.map((t) => (
            <Chip key={t} label={t} />
          ))}
        </div>
      </div>
    </div>
  );
}
