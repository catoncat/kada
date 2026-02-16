interface VerticalRect {
  top: number;
  bottom: number;
}

export interface MentionSuggestionLayoutInput {
  overlayRect: VerticalRect;
  inputRect: VerticalRect;
  viewportHeight: number;
  edgePadding?: number;
  maxHeightCap?: number;
}

const DEFAULT_EDGE_PADDING = 12;
const DEFAULT_MAX_HEIGHT_CAP = 320;

export function computeMentionSuggestionMaxHeight({
  overlayRect,
  inputRect,
  viewportHeight,
  edgePadding = DEFAULT_EDGE_PADDING,
  maxHeightCap = DEFAULT_MAX_HEIGHT_CAP,
}: MentionSuggestionLayoutInput): number {
  const renderAboveInput = overlayRect.top + 1 < inputRect.top;
  const availableSpace = renderAboveInput
    ? overlayRect.bottom - edgePadding
    : viewportHeight - overlayRect.top - edgePadding;
  const bounded = Math.min(maxHeightCap, availableSpace);
  return Math.max(0, Math.floor(bounded));
}
