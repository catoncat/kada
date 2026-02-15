import { Lightbulb, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { WorkspaceActionCard } from '@/types/workspace';

export function ActionCards({
  cards,
  onApply,
  applyingCardId,
}: {
  cards: WorkspaceActionCard[];
  onApply: (card: WorkspaceActionCard) => void;
  applyingCardId: string | null;
}) {
  if (cards.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" />
        可应用建议
      </div>

      {cards.map((card) => {
        const applying = applyingCardId === card.id;
        return (
          <div
            key={card.id}
            className={cn(
              'rounded-xl border bg-card p-3',
              applying && 'border-primary/40 bg-primary/5',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{card.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{card.reason}</p>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                <Lightbulb className="h-3 w-3" />
                {card.operations.length} 步
              </div>
            </div>

            <Button
              size="sm"
              className="mt-3 w-full"
              variant="outline"
              disabled={applying}
              onClick={() => onApply(card)}
            >
              {applying ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  应用中...
                </>
              ) : (
                '应用到画布'
              )}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
