import { Crosshair, LocateFixed, Minus, Plus } from 'lucide-react';
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { WorkspaceNode, WorkspaceViewport } from '@/types/workspace';

interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface DragState {
  mode: 'none' | 'pan' | 'move-node' | 'select-box';
  pointerId: number;
  startClientX: number;
  startClientY: number;
  deltaCanvasX: number;
  deltaCanvasY: number;
  movingNodeIds: string[];
  selectionBox: SelectionBox | null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getSelectionBounds(box: SelectionBox) {
  const left = Math.min(box.startX, box.endX);
  const top = Math.min(box.startY, box.endY);
  const right = Math.max(box.startX, box.endX);
  const bottom = Math.max(box.startY, box.endY);
  return { left, top, right, bottom };
}

function nodeRectInScreen(node: WorkspaceNode, viewport: WorkspaceViewport) {
  const scale = viewport.scale;
  return {
    left: node.x * scale + viewport.x,
    top: node.y * scale + viewport.y,
    right: (node.x + node.width) * scale + viewport.x,
    bottom: (node.y + node.height) * scale + viewport.y,
  };
}

export function CanvasBoard({
  nodes,
  selectedNodeIds,
  viewport,
  onViewportChange,
  onSelectionChange,
  onMoveNodes,
}: {
  nodes: WorkspaceNode[];
  selectedNodeIds: string[];
  viewport: WorkspaceViewport;
  onViewportChange: (viewport: WorkspaceViewport) => void;
  onSelectionChange: (ids: string[]) => void;
  onMoveNodes: (nodeIds: string[], deltaX: number, deltaY: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState>({
    mode: 'none',
    pointerId: -1,
    startClientX: 0,
    startClientY: 0,
    deltaCanvasX: 0,
    deltaCanvasY: 0,
    movingNodeIds: [],
    selectionBox: null,
  });

  const selectedSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);

  const onWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;

      const nextScale = clamp(
        viewport.scale * (event.deltaY > 0 ? 0.92 : 1.08),
        0.3,
        2.5,
      );

      const worldX = (cursorX - viewport.x) / viewport.scale;
      const worldY = (cursorY - viewport.y) / viewport.scale;

      onViewportChange({
        scale: nextScale,
        x: cursorX - worldX * nextScale,
        y: cursorY - worldY * nextScale,
      });
    },
    [onViewportChange, viewport],
  );

  const beginPan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDrag({
      mode: 'pan',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      deltaCanvasX: 0,
      deltaCanvasY: 0,
      movingNodeIds: [],
      selectionBox: null,
    });
  }, []);

  const beginSelection = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const startX = event.clientX - rect.left;
    const startY = event.clientY - rect.top;

    setDrag({
      mode: 'select-box',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      deltaCanvasX: 0,
      deltaCanvasY: 0,
      movingNodeIds: [],
      selectionBox: {
        startX,
        startY,
        endX: startX,
        endY: startY,
      },
    });
  }, []);

  const beginMoveNode = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, nodeId: string) => {
      event.preventDefault();
      event.stopPropagation();

      const isSelected = selectedSet.has(nodeId);
      const movingNodeIds =
        isSelected && selectedNodeIds.length > 0 ? selectedNodeIds : [nodeId];

      if (!isSelected) {
        onSelectionChange([nodeId]);
      }

      setDrag({
        mode: 'move-node',
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        deltaCanvasX: 0,
        deltaCanvasY: 0,
        movingNodeIds,
        selectionBox: null,
      });
    },
    [onSelectionChange, selectedNodeIds, selectedSet],
  );

  useEffect(() => {
    if (drag.mode === 'none') return;

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;
      if (!containerRef.current) return;

      const deltaX = event.clientX - drag.startClientX;
      const deltaY = event.clientY - drag.startClientY;

      if (drag.mode === 'pan') {
        onViewportChange({
          ...viewport,
          x: viewport.x + deltaX,
          y: viewport.y + deltaY,
        });

        setDrag((prev) => ({
          ...prev,
          startClientX: event.clientX,
          startClientY: event.clientY,
        }));
        return;
      }

      if (drag.mode === 'move-node') {
        const deltaCanvasX = deltaX / viewport.scale;
        const deltaCanvasY = deltaY / viewport.scale;
        setDrag((prev) => ({
          ...prev,
          deltaCanvasX,
          deltaCanvasY,
        }));
        return;
      }

      if (drag.mode === 'select-box') {
        const rect = containerRef.current.getBoundingClientRect();
        const endX = event.clientX - rect.left;
        const endY = event.clientY - rect.top;
        setDrag((prev) => ({
          ...prev,
          selectionBox: prev.selectionBox
            ? {
                ...prev.selectionBox,
                endX,
                endY,
              }
            : null,
        }));
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;

      if (drag.mode === 'move-node') {
        if (
          Math.abs(drag.deltaCanvasX) > 0.01 ||
          Math.abs(drag.deltaCanvasY) > 0.01
        ) {
          if (drag.movingNodeIds.length > 0) {
            onMoveNodes(drag.movingNodeIds, drag.deltaCanvasX, drag.deltaCanvasY);
          }
        }
      }

      if (drag.mode === 'select-box' && drag.selectionBox) {
        const bounds = getSelectionBounds(drag.selectionBox);
        const ids = nodes
          .filter((node) => {
            const rect = nodeRectInScreen(node, viewport);
            return (
              rect.left <= bounds.right &&
              rect.right >= bounds.left &&
              rect.top <= bounds.bottom &&
              rect.bottom >= bounds.top
            );
          })
          .map((node) => node.id);

        onSelectionChange(ids);
      }

      setDrag({
        mode: 'none',
        pointerId: -1,
        startClientX: 0,
        startClientY: 0,
        deltaCanvasX: 0,
        deltaCanvasY: 0,
        movingNodeIds: [],
        selectionBox: null,
      });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [drag, nodes, onMoveNodes, onSelectionChange, onViewportChange, viewport]);

  const fitView = useCallback(() => {
    if (!containerRef.current || nodes.length === 0) return;

    const minX = Math.min(...nodes.map((node) => node.x));
    const minY = Math.min(...nodes.map((node) => node.y));
    const maxX = Math.max(...nodes.map((node) => node.x + node.width));
    const maxY = Math.max(...nodes.map((node) => node.y + node.height));

    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);

    const rect = containerRef.current.getBoundingClientRect();
    const padding = 64;
    const nextScale = clamp(
      Math.min(
        (rect.width - padding * 2) / contentWidth,
        (rect.height - padding * 2) / contentHeight,
      ),
      0.3,
      2,
    );

    onViewportChange({
      scale: nextScale,
      x: rect.width / 2 - (minX + contentWidth / 2) * nextScale,
      y: rect.height / 2 - (minY + contentHeight / 2) * nextScale,
    });
  }, [nodes, onViewportChange]);

  const previewOffsets = drag.mode === 'move-node'
    ? { x: drag.deltaCanvasX, y: drag.deltaCanvasY }
    : { x: 0, y: 0 };

  const selectionStyle: CSSProperties | undefined =
    drag.selectionBox && drag.mode === 'select-box'
      ? {
          left: Math.min(drag.selectionBox.startX, drag.selectionBox.endX),
          top: Math.min(drag.selectionBox.startY, drag.selectionBox.endY),
          width: Math.abs(drag.selectionBox.endX - drag.selectionBox.startX),
          height: Math.abs(drag.selectionBox.endY - drag.selectionBox.startY),
        }
      : undefined;

  return (
    <section className="relative flex h-full min-h-0 flex-1 flex-col bg-[#F5F5F7] dark:bg-[#18181B]">
      <div className="border-b bg-background/80 px-3 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Crosshair className="h-3.5 w-3.5" />
            画布缩放 {Math.round(viewport.scale * 100)}%
          </div>

          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() =>
                onViewportChange({
                  ...viewport,
                  scale: clamp(viewport.scale * 0.9, 0.3, 2.5),
                })
              }
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() =>
                onViewportChange({
                  ...viewport,
                  scale: clamp(viewport.scale * 1.1, 0.3, 2.5),
                })
              }
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={fitView}>
              <LocateFixed className="mr-1 h-3.5 w-3.5" />
              适配视图
            </Button>
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        onWheel={onWheel}
        onPointerDown={(event) => {
          const target = event.target as HTMLElement;
          const onNode = target.closest('[data-node-id]');
          if (onNode) return;

          if (event.button === 1 || event.button === 2 || event.metaKey) {
            beginPan(event);
            return;
          }

          beginSelection(event);
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundSize: '24px 24px',
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(120,120,130,0.20) 1px, transparent 0)',
          }}
        />

        <div
          className="absolute inset-0 origin-top-left"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          }}
        >
          {nodes.map((node) => {
            const selected = selectedSet.has(node.id);
            const offsetX = selected ? previewOffsets.x : 0;
            const offsetY = selected ? previewOffsets.y : 0;

            return (
              <button
                key={node.id}
                type="button"
                data-node-id={node.id}
                onPointerDown={(event) => beginMoveNode(event, node.id)}
                onClick={(event) => {
                  event.stopPropagation();
                  if (event.shiftKey) {
                    if (selected) {
                      onSelectionChange(
                        selectedNodeIds.filter((item) => item !== node.id),
                      );
                    } else {
                      onSelectionChange([...selectedNodeIds, node.id]);
                    }
                  } else {
                    onSelectionChange([node.id]);
                  }
                }}
                className={cn(
                  'absolute rounded-xl border bg-card p-3 text-left shadow-sm',
                  selected
                    ? 'border-primary ring-2 ring-primary/30'
                    : 'border-border hover:border-primary/40',
                )}
                style={{
                  left: node.x + offsetX,
                  top: node.y + offsetY,
                  width: node.width,
                  height: node.height,
                  zIndex: node.zIndex,
                }}
              >
                <div className="flex h-full flex-col">
                  <p className="truncate text-sm font-medium">{node.title || '未命名节点'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{node.type}</p>
                  <div className="mt-auto truncate text-[11px] text-muted-foreground">
                    {node.type === 'note'
                      ? String(node.meta?.content || '便签')
                      : String(node.meta?.description || node.meta?.appearancePrompt || '')}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {selectionStyle ? (
          <div
            className="pointer-events-none absolute border border-primary bg-primary/10"
            style={selectionStyle}
          />
        ) : null}
      </div>
    </section>
  );
}
