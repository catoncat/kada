import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface ExecutionConfirmDialogItem {
  label: string;
  value: string;
}

export function ExecutionConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = '取消',
  canConfirm = true,
  isConfirming = false,
  items,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  canConfirm?: boolean;
  isConfirming?: boolean;
  items: ExecutionConfirmDialogItem[];
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-2">
          {items.map((item) => (
            <div
              key={`${item.label}:${item.value}`}
              className="rounded-lg border bg-muted/20 px-3 py-2"
            >
              <div className="text-xs text-muted-foreground">{item.label}</div>
              <div className="mt-0.5 text-sm">{item.value}</div>
            </div>
          ))}
        </DialogPanel>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button onClick={onConfirm} disabled={!canConfirm || isConfirming}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
