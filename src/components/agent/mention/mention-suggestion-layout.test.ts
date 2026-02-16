import { describe, expect, it } from 'vitest';
import { computeMentionSuggestionMaxHeight } from './mention-suggestion-layout';

describe('computeMentionSuggestionMaxHeight', () => {
  it('在下方弹出时，按下方可用空间限制高度', () => {
    const result = computeMentionSuggestionMaxHeight({
      overlayRect: { top: 700, bottom: 860 },
      inputRect: { top: 660, bottom: 692 },
      viewportHeight: 900,
      edgePadding: 12,
      maxHeightCap: 320,
    });

    expect(result).toBe(188);
  });

  it('在上方弹出时，按上方可用空间限制高度', () => {
    const result = computeMentionSuggestionMaxHeight({
      overlayRect: { top: 140, bottom: 420 },
      inputRect: { top: 460, bottom: 500 },
      viewportHeight: 900,
      edgePadding: 12,
      maxHeightCap: 320,
    });

    expect(result).toBe(320);
  });

  it('可用空间不足时返回 0，避免越界绘制', () => {
    const result = computeMentionSuggestionMaxHeight({
      overlayRect: { top: 820, bottom: 850 },
      inputRect: { top: 780, bottom: 810 },
      viewportHeight: 820,
      edgePadding: 16,
      maxHeightCap: 320,
    });

    expect(result).toBe(0);
  });
});
