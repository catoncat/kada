'use client';

import { useEffect, useMemo, useState } from 'react';

export type TocSection = {
  id: string;
  label: string;
  level?: 0 | 1;
};

export default function PlanToc({
  sections,
  containerSelector,
}: {
  sections: TocSection[];
  /** 可滚动容器的 selector（用于滚动定位）。不给则滚动 window */
  containerSelector?: string;
}) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? '');

  const ids = useMemo(() => sections.map((s) => s.id), [sections]);

  useEffect(() => {
    if (!ids.length) return;

    const elements = ids
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];

    if (!elements.length) return;

    const rootEl = containerSelector
      ? (document.querySelector(containerSelector) as HTMLElement | null)
      : null;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0));
        if (visible[0]?.target?.id) setActiveId(visible[0].target.id);
      },
      {
        root: rootEl,
        rootMargin: '-20% 0px -70% 0px',
        threshold: [0.02, 0.1, 0.2, 0.4, 0.6],
      }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);

  const scrollTo = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;

    // For this app we mainly scroll inside the page's custom container;
    // but smooth scrolling on that container requires manual scroll.
    if (containerSelector) {
      const container = document.querySelector(containerSelector) as HTMLElement | null;
      if (container) {
        const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
        container.scrollTo({ top: Math.max(0, top - 16), behavior: 'smooth' });
        return;
      }
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!sections.length) return null;

  return (
    <nav className="sticky top-6 hidden lg:block">
      <div className="rounded-[var(--radius-2xl)] border border-[var(--line)] bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold text-[var(--ink-3)] tracking-widest">目录</div>
        <div className="mt-3 space-y-1">
          {sections.map((s) => {
            const isActive = s.id === activeId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollTo(s.id)}
                className={
                  `w-full text-left rounded-xl px-3 py-2 text-sm transition ` +
                  ((s.level ?? 0) === 1 ? 'pl-6 text-[13px] ' : '') +
                  (isActive
                    ? 'bg-gray-50 text-[var(--ink)] font-semibold'
                    : 'text-[var(--ink-2)] hover:bg-gray-50')
                }
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
