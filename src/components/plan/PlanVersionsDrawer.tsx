/**
 * PlanVersionsDrawer - 版本列表抽屉
 * 目前后端 API 不支持版本列表，先显示"即将推出"
 */

import { Clock } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetTitle,
} from '@/components/ui/sheet';

export interface PlanVersionsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function PlanVersionsDrawer({
  open,
  onOpenChange,
}: PlanVersionsDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" variant="inset">
        <SheetHeader>
          <SheetTitle>版本历史</SheetTitle>
          <SheetDescription>查看和切换方案的历史版本</SheetDescription>
        </SheetHeader>
        <SheetPanel>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Clock className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              即将推出
            </h3>
            <p className="text-sm text-muted-foreground max-w-[200px]">
              版本历史功能正在开发中，敬请期待
            </p>
          </div>
        </SheetPanel>
      </SheetContent>
    </Sheet>
  );
}
