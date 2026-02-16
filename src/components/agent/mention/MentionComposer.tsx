import { Loader2, Paperclip } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
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
import { cn } from '@/lib/utils';
import type { AgentMention, AgentMentionImageRef } from '@/types/agent';
import { MentionPickDialog } from './MentionPickDialog';
import {
  AGENT_MENTION_KIND_LABEL,
  MENTION_MARKUP,
  mergeMentionsFromOccurrences,
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
    list: {
      backgroundColor: 'hsl(var(--popover))',
      border: '1px solid hsl(var(--border))',
      borderRadius: 10,
      boxShadow: '0 10px 28px rgba(0, 0, 0, 0.16)',
      overflow: 'hidden',
      zIndex: 40,
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
  ({ value, disabled, placeholder, onChange, onKeyDown }, ref) => {
    const searchSeqRef = useRef(0);
    const searchTimerRef = useRef<number | null>(null);

    const [pickOpen, setPickOpen] = useState(false);
    const [pickReloadKey, setPickReloadKey] = useState(0);
    const [pickTargetId, setPickTargetId] = useState<string | null>(null);
    const [pickItems, setPickItems] = useState<AgentMentionImageRef[]>([]);
    const [pickSelectedIds, setPickSelectedIds] = useState<Set<string>>(
      () => new Set(),
    );
    const [pickLoading, setPickLoading] = useState(false);
    const [pickError, setPickError] = useState<string | null>(null);

    const pickTarget = useMemo(
      () =>
        pickTargetId
          ? value.mentions.find((mention) => mention.mentionId === pickTargetId) ||
            null
          : null,
      [pickTargetId, value.mentions],
    );

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

    const openPickDialog = useCallback((mentionId: string) => {
      setPickTargetId(mentionId);
      setPickReloadKey((prev) => prev + 1);
      setPickOpen(true);
    }, []);

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
        return (
          <div
            className={cn(
              'flex items-center justify-between gap-2 rounded-md px-1',
              focused && 'bg-accent/70',
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-sm">{highlightedDisplay}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {AGENT_MENTION_KIND_LABEL[item.kind]} · {item.subtitle}
              </p>
            </div>
          </div>
        );
      },
      [],
    );

    return (
      <div className="relative">
        <MentionsInput
          value={value.markup}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          inputRef={ref}
          placeholder={placeholder}
          disabled={disabled}
          style={mentionInputStyle}
          allowSuggestionsAboveCursor
          a11ySuggestionsListLabel="Agent 资源候选"
        >
          <Mention
            trigger="@"
            markup={MENTION_MARKUP}
            data={loadMentionSuggestions}
            appendSpaceOnAdd
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
              return (
                <article
                  key={mention.mentionId}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/20 px-2 py-1"
                >
                  <p className="max-w-[220px] truncate text-xs">
                    {AGENT_MENTION_KIND_LABEL[mention.kind]} · {mention.resourceTitle}
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    {imageCount} 图
                  </span>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    title="选择图片"
                    disabled={disabled}
                    onClick={() => openPickDialog(mention.mentionId)}
                  >
                    {isPicking && pickLoading ? (
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
