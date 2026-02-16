import { Loader2, Paperclip } from 'lucide-react';
import { useHotkey } from '@tanstack/react-hotkeys';
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  Mention,
  MentionsInput,
  type DataFunc,
  type MentionItem,
  type MentionsInputStyle,
  type SuggestionDataItem,
} from 'react-mentions';
import { Button } from '@/components/ui/button';
import { listAgentResourceImages, searchAgentResources } from '@/lib/agent-api';
import { getImageUrl } from '@/lib/scene-assets-api';
import { cn } from '@/lib/utils';
import type { AgentMention, AgentMentionImageRef } from '@/types/agent';
import { MentionPickDialog } from './MentionPickDialog';
import { computeMentionSuggestionMaxHeight } from './mention-suggestion-layout';
import {
  AGENT_MENTION_KIND_LABEL,
  MENTION_MARKUP,
  mergeMentionsFromOccurrences,
  parseMentionTokenId,
  toMentionSuggestionData,
  type MentionSuggestionData,
} from './mention-utils';

export interface MentionComposerValue {
  markup: string;
  text: string;
  mentions: AgentMention[];
}

interface MentionComposerProps {
  value: MentionComposerValue;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: MentionComposerValue) => void;
  onKeyDown?: (
    event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  onCompositionStart?: (
    event: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  onCompositionEnd?: (
    event: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
}

const SUGGESTIONS_HEIGHT_CAP = 320;
const SUGGESTIONS_EDGE_PADDING = 12;
const SUGGESTIONS_FALLBACK_HEIGHT = 240;
const AUTO_BIND_IMAGE_LIMIT = 1;
type MentionSelectionMode = 'resource-only' | 'primary-image' | 'pick-images';

function MentionSuggestionsContainer({
  children,
  inputElementRef,
}: {
  children: React.ReactNode;
  inputElementRef: React.RefObject<
    HTMLTextAreaElement | HTMLInputElement | null
  >;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [maxHeight, setMaxHeight] = useState(SUGGESTIONS_FALLBACK_HEIGHT);

  const updateMaxHeight = useCallback(() => {
    const container = containerRef.current;
    const input = inputElementRef.current;
    if (!container || !input) return;

    const viewportHeight = Math.max(
      document.documentElement.clientHeight,
      window.innerHeight || 0,
    );
    const next = computeMentionSuggestionMaxHeight({
      overlayRect: container.getBoundingClientRect(),
      inputRect: input.getBoundingClientRect(),
      viewportHeight,
      edgePadding: SUGGESTIONS_EDGE_PADDING,
      maxHeightCap: SUGGESTIONS_HEIGHT_CAP,
    });

    setMaxHeight((prev) => (prev === next ? prev : next));
  }, [inputElementRef]);

  useLayoutEffect(() => {
    updateMaxHeight();
  }, [updateMaxHeight]);

  useEffect(() => {
    const handleViewportChange = () => {
      updateMaxHeight();
    };

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [updateMaxHeight]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      updateMaxHeight();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [updateMaxHeight]);

  return (
    <div
      ref={containerRef}
      style={
        {
          '--mention-suggestions-max-height': `${maxHeight}px`,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

const mentionInputStyle: MentionsInputStyle = {
  control: {
    width: '100%',
    minHeight: 106,
    fontSize: 14,
    lineHeight: 1.6,
  },
  highlighter: {
    padding: '12px 12px 44px',
    borderRadius: 12,
    border: '1px solid transparent',
    minHeight: 106,
    boxSizing: 'border-box',
  },
  input: {
    width: '100%',
    minHeight: 106,
    margin: 0,
    padding: '12px 12px 44px',
    borderRadius: 12,
    border: '1px solid hsl(var(--border))',
    color: 'hsl(var(--foreground))',
    backgroundColor: 'hsl(var(--background))',
    fontSize: 14,
    lineHeight: 1.6,
    outline: 'none',
    resize: 'none',
    boxSizing: 'border-box',
  },
  suggestions: {
    zIndex: 60,
    list: {
      backgroundColor: 'hsl(var(--popover))',
      border: '1px solid hsl(var(--border))',
      borderRadius: 10,
      boxShadow: '0 10px 28px rgba(0, 0, 0, 0.16)',
      maxHeight: 'var(--mention-suggestions-max-height, 240px)',
      overflowX: 'hidden',
      overflowY: 'auto',
      overscrollBehavior: 'contain',
    },
    item: {
      padding: '8px 10px',
      borderBottom: '1px solid hsl(var(--border) / 0.6)',
      '&focused': {
        backgroundColor: 'hsl(var(--accent))',
      },
    },
  },
};

export const MentionComposer = forwardRef<HTMLTextAreaElement, MentionComposerProps>(
  (
    {
      value,
      disabled,
      placeholder,
      onChange,
      onKeyDown,
      onCompositionStart,
      onCompositionEnd,
    },
    ref,
  ) => {
    const latestValueRef = useRef(value);
    const inputElementRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(
      null,
    );
    const searchSeqRef = useRef(0);
    const searchTimerRef = useRef<number | null>(null);
    const suggestionsPortalHost = useMemo(
      () => (typeof document === 'undefined' ? undefined : document.body),
      [],
    );

    const [pickOpen, setPickOpen] = useState(false);
    const [pickReloadKey, setPickReloadKey] = useState(0);
    const [pickTargetId, setPickTargetId] = useState<string | null>(null);
    const [pickItems, setPickItems] = useState<AgentMentionImageRef[]>([]);
    const [pickSelectedIds, setPickSelectedIds] = useState<Set<string>>(
      () => new Set(),
    );
    const [pickLoading, setPickLoading] = useState(false);
    const [pickError, setPickError] = useState<string | null>(null);
    const [autoBindingMentionIds, setAutoBindingMentionIds] = useState<Set<string>>(
      () => new Set(),
    );
    const selectionModeByTokenIdRef = useRef<Map<string, MentionSelectionMode>>(
      new Map(),
    );

    const pickTarget = useMemo(
      () =>
        pickTargetId
          ? value.mentions.find((mention) => mention.mentionId === pickTargetId) ||
            null
          : null,
      [pickTargetId, value.mentions],
    );

    useEffect(() => {
      latestValueRef.current = value;
    }, [value]);

    useEffect(() => {
      return () => {
        if (searchTimerRef.current) {
          window.clearTimeout(searchTimerRef.current);
          searchTimerRef.current = null;
        }
      };
    }, []);

    useEffect(() => {
      if (!pickTargetId) return;
      const exists = value.mentions.some(
        (mention) => mention.mentionId === pickTargetId,
      );
      if (!exists) {
        setPickOpen(false);
        setPickTargetId(null);
      }
    }, [pickTargetId, value.mentions]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: pickReloadKey 仅用于主动触发重新拉取
    useEffect(() => {
      if (!pickOpen || !pickTarget) return;

      let cancelled = false;
      setPickLoading(true);
      setPickError(null);
      setPickSelectedIds(
        new Set((pickTarget.images || []).map((image) => image.id)),
      );

      void listAgentResourceImages({
        kind: pickTarget.kind,
        id: pickTarget.resourceId,
        limit: 80,
      })
        .then((res) => {
          if (cancelled) return;
          setPickItems(res.data || []);
        })
        .catch((error) => {
          if (cancelled) return;
          setPickItems([]);
          setPickError(
            error instanceof Error
              ? error.message
              : '加载图片失败，请稍后重试',
          );
        })
        .finally(() => {
          if (cancelled) return;
          setPickLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [pickOpen, pickReloadKey, pickTarget]);

    const loadMentionSuggestions = useCallback<DataFunc>((query, callback) => {
      if (disabled) {
        callback([]);
        return;
      }
      if (searchTimerRef.current) {
        window.clearTimeout(searchTimerRef.current);
      }
      const seq = ++searchSeqRef.current;
      searchTimerRef.current = window.setTimeout(() => {
        void searchAgentResources({
          q: query,
          kinds: ['project', 'scene', 'model', 'image'],
          limit: 24,
        })
          .then((res) => {
            if (seq !== searchSeqRef.current) return;
            const suggestions = res.data.map(toMentionSuggestionData);
            callback(suggestions);
          })
          .catch(() => {
            if (seq !== searchSeqRef.current) return;
            callback([]);
          });
      }, 120);
    }, [disabled]);

    const handleChange = useCallback(
      (
        _event: { target: { value: string } },
        nextMarkupValue: string,
        nextPlainTextValue: string,
        mentions: MentionItem[],
      ) => {
        const nextMentions = mergeMentionsFromOccurrences(mentions, value.mentions);
        onChange({
          markup: nextMarkupValue,
          text: nextPlainTextValue,
          mentions: nextMentions,
        });
      },
      [onChange, value.mentions],
    );

    const setTokenSelectionMode = useCallback(
      (tokenId: string, mode: MentionSelectionMode) => {
        selectionModeByTokenIdRef.current.set(tokenId, mode);
      },
      [],
    );

    const consumeTokenSelectionMode = useCallback((tokenId: string) => {
      const mode = selectionModeByTokenIdRef.current.get(tokenId);
      if (mode) {
        selectionModeByTokenIdRef.current.delete(tokenId);
      }
      return mode;
    }, []);

    const openPickDialogWithRetry = useCallback(
      (mentionId: string, retries = 8): void => {
        const mentionExists = latestValueRef.current.mentions.some(
          (mention) => mention.mentionId === mentionId,
        );
        if (!mentionExists) {
          if (retries <= 0) return;
          window.setTimeout(() => {
            openPickDialogWithRetry(mentionId, retries - 1);
          }, 40);
          return;
        }
        setPickTargetId(mentionId);
        setPickReloadKey((prev) => prev + 1);
        setPickOpen(true);
      },
      [],
    );

    const applyMentionImages = useCallback(
      (mentionId: string, images: AgentMentionImageRef[]): boolean => {
        const current = latestValueRef.current;
        const targetIndex = current.mentions.findIndex(
          (mention) => mention.mentionId === mentionId,
        );
        if (targetIndex < 0) return false;

        const nextMentions = current.mentions.map((mention) =>
          mention.mentionId === mentionId
            ? {
                ...mention,
                images,
              }
            : mention,
        );

        onChange({
          ...current,
          mentions: nextMentions,
        });

        return true;
      },
      [onChange],
    );

    const applyMentionImagesWithRetry = useCallback(
      (mentionId: string, images: AgentMentionImageRef[], retries = 8): void => {
        if (applyMentionImages(mentionId, images)) return;
        if (retries <= 0) return;
        window.setTimeout(() => {
          applyMentionImagesWithRetry(mentionId, images, retries - 1);
        }, 40);
      },
      [applyMentionImages],
    );

    const setMentionAutoBinding = useCallback(
      (mentionId: string, binding: boolean) => {
        setAutoBindingMentionIds((prev) => {
          const next = new Set(prev);
          if (binding) {
            next.add(mentionId);
          } else {
            next.delete(mentionId);
          }
          return next;
        });
      },
      [],
    );

    const handleMentionAdd = useCallback(
      (id: string | number) => {
        if (disabled) return;
        const tokenId = String(id);
        const parsed = parseMentionTokenId(tokenId);
        if (!parsed) return;
        const mode =
          consumeTokenSelectionMode(tokenId) || ('primary-image' as const);

        if (mode === 'pick-images') {
          openPickDialogWithRetry(parsed.mentionId);
        }
        if (mode === 'resource-only') {
          return;
        }

        setMentionAutoBinding(parsed.mentionId, true);
        void listAgentResourceImages({
          kind: parsed.kind,
          id: parsed.resourceId,
          limit: AUTO_BIND_IMAGE_LIMIT,
        })
          .then((res) => {
            const firstImage = res.data?.[0];
            if (!firstImage) return;
            applyMentionImagesWithRetry(parsed.mentionId, [firstImage]);
          })
          .catch(() => {
            // 自动绑定失败时静默降级：用户仍可手动点击“选择图片”。
          })
          .finally(() => {
            setMentionAutoBinding(parsed.mentionId, false);
          });
      },
      [
        applyMentionImagesWithRetry,
        consumeTokenSelectionMode,
        disabled,
        openPickDialogWithRetry,
        setMentionAutoBinding,
      ],
    );

    const openPickDialog = useCallback((mentionId: string) => {
      setPickTargetId(mentionId);
      setPickReloadKey((prev) => prev + 1);
      setPickOpen(true);
    }, []);

    useHotkey(
      'Alt+Enter',
      () => {
        if (disabled) return;
        const lastMention = latestValueRef.current.mentions.at(-1);
        if (!lastMention) return;
        openPickDialog(lastMention.mentionId);
      },
      {
        target: inputElementRef,
        enabled: !disabled,
        ignoreInputs: false,
        preventDefault: true,
        stopPropagation: true,
      },
    );

    const handlePickOpenChange = useCallback((open: boolean) => {
      setPickOpen(open);
      if (!open) {
        setPickTargetId(null);
      }
    }, []);

    const handlePickToggle = useCallback((id: string) => {
      setPickSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    }, []);

    const handlePickClear = useCallback(() => {
      setPickSelectedIds(new Set());
    }, []);

    const handlePickInvert = useCallback(() => {
      setPickSelectedIds((prev) => {
        const next = new Set<string>();
        for (const item of pickItems) {
          if (!prev.has(item.id)) {
            next.add(item.id);
          }
        }
        return next;
      });
    }, [pickItems]);

    const handlePickConfirm = useCallback(() => {
      if (!pickTarget) {
        setPickOpen(false);
        return;
      }
      const selected = pickItems.filter((item) => pickSelectedIds.has(item.id));
      const nextMentions = value.mentions.map((mention) =>
        mention.mentionId === pickTarget.mentionId
          ? {
              ...mention,
              images: selected,
            }
          : mention,
      );

      onChange({
        ...value,
        mentions: nextMentions,
      });
      setPickOpen(false);
    }, [onChange, pickItems, pickSelectedIds, pickTarget, value]);

    const renderSuggestion = useCallback(
      (
        suggestion: SuggestionDataItem,
        _search: string,
        highlightedDisplay: React.ReactNode,
        _index: number,
        focused: boolean,
      ) => {
        const item = suggestion as MentionSuggestionData;
        const tokenId = String(item.id);
        const assignMode = (mode: MentionSelectionMode) =>
          setTokenSelectionMode(tokenId, mode);
        return (
          <div
            className={cn(
              'flex items-start justify-between gap-2 rounded-md px-1',
              focused && 'bg-accent/70',
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{highlightedDisplay}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {AGENT_MENTION_KIND_LABEL[item.kind]} · {item.subtitle}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1 pt-0.5">
              <button
                type="button"
                className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                onMouseDown={(event) => {
                  event.preventDefault();
                  assignMode('resource-only');
                }}
              >
                仅资源
              </button>
              <button
                type="button"
                className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                onMouseDown={(event) => {
                  event.preventDefault();
                  assignMode('primary-image');
                }}
              >
                主图
              </button>
              <button
                type="button"
                className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                onMouseDown={(event) => {
                  event.preventDefault();
                  assignMode('pick-images');
                }}
              >
                多图...
              </button>
            </div>
          </div>
        );
      },
      [setTokenSelectionMode],
    );

    const renderSuggestionsContainer = useCallback(
      (children: React.ReactNode) => (
        <MentionSuggestionsContainer inputElementRef={inputElementRef}>
          {children}
        </MentionSuggestionsContainer>
      ),
      [],
    );

    const handleInputRef = useCallback(
      (node: HTMLTextAreaElement | HTMLInputElement | null) => {
        inputElementRef.current = node;
        const textareaNode =
          node instanceof HTMLTextAreaElement ? node : null;
        if (!ref) return;
        if (typeof ref === 'function') {
          ref(textareaNode);
          return;
        }
        ref.current = textareaNode;
      },
      [ref],
    );

    return (
      <div className="relative">
        <MentionsInput
          value={value.markup}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          inputRef={handleInputRef}
          placeholder={placeholder}
          disabled={disabled}
          style={mentionInputStyle}
          allowSuggestionsAboveCursor
          suggestionsPortalHost={suggestionsPortalHost}
          customSuggestionsContainer={renderSuggestionsContainer}
          a11ySuggestionsListLabel="Agent 资源候选"
        >
          <Mention
            trigger="@"
            markup={MENTION_MARKUP}
            data={loadMentionSuggestions}
            appendSpaceOnAdd
            onAdd={handleMentionAdd}
            displayTransform={(_id, display) => `@${display}`}
            renderSuggestion={renderSuggestion}
            style={{
              backgroundColor: 'hsl(var(--primary) / 0.18)',
              borderRadius: 6,
            }}
          />
        </MentionsInput>

        {value.mentions.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {value.mentions.map((mention) => {
              const imageCount = mention.images?.length || 0;
              const isPicking =
                pickOpen && pickTarget?.mentionId === mention.mentionId;
              const preview = mention.images?.[0];
              const previewLabel = preview?.label || preview?.filePath || '预览图';
              return (
                <article
                  key={mention.mentionId}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted/20 px-2 py-1"
                >
                  {preview ? (
                    <img
                      src={getImageUrl(preview.filePath)}
                      alt={previewLabel}
                      className="h-5 w-5 rounded-full border object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">
                      {AGENT_MENTION_KIND_LABEL[mention.kind].slice(0, 1)}
                    </span>
                  )}
                  <p className="max-w-[220px] truncate text-xs">
                    {AGENT_MENTION_KIND_LABEL[mention.kind]} · {mention.resourceTitle}
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    {imageCount > 0 ? `${imageCount} 图` : '未选图'}
                  </span>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    title={imageCount > 0 ? '调整图片' : '选择图片'}
                    disabled={disabled}
                    onClick={() => openPickDialog(mention.mentionId)}
                  >
                    {((isPicking && pickLoading) ||
                      autoBindingMentionIds.has(mention.mentionId)) ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Paperclip className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </article>
              );
            })}
          </div>
        ) : null}

        <MentionPickDialog
          open={pickOpen}
          target={pickTarget}
          items={pickItems}
          loading={pickLoading}
          error={pickError}
          selectedIds={pickSelectedIds}
          onOpenChange={handlePickOpenChange}
          onRetry={() => setPickReloadKey((prev) => prev + 1)}
          onToggle={handlePickToggle}
          onClear={handlePickClear}
          onInvert={handlePickInvert}
          onConfirm={handlePickConfirm}
        />
      </div>
    );
  },
);

MentionComposer.displayName = 'MentionComposer';
