import type { WindowLayoutInput } from './library';

export type WindowBounds = { x: number; y: number; width: number; height: number };
export type WindowLayout = { bounds: WindowBounds; minimumWidth: number; minimumHeight: number };

export const expandedWindowSize = { width: 640, height: 860 };
export const simpleSearchHeight = 96;

export function clampWindowBounds(bounds: WindowBounds, workArea: WindowBounds): WindowBounds {
  const width = Math.min(Math.max(1, Math.round(bounds.width)), workArea.width);
  const height = Math.min(Math.max(1, Math.round(bounds.height)), workArea.height);
  return {
    x: Math.round(Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - width)),
    y: Math.round(Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - height)),
    width,
    height,
  };
}

export function simpleWindowHeight(input: Pick<WindowLayoutInput, 'hasQuery' | 'resultCount' | 'contentHeight'>): number {
  if (input.contentHeight !== undefined) return Math.max(simpleSearchHeight, Math.min(640, input.contentHeight));
  return input.hasQuery ? simpleSearchHeight + Math.max(1, Math.min(input.resultCount, 6)) * 64 + 32 : simpleSearchHeight;
}

// The simple anchor is separate from fitted bounds. A taller result list near the
// screen edge can move up temporarily, then return when the query is cleared.
export class WindowLayouts {
  mode: WindowLayoutInput['mode'] = 'expanded';
  private expandedBounds: WindowBounds;
  private simpleAnchor?: Pick<WindowBounds, 'x' | 'y' | 'width'>;

  constructor(expandedBounds: WindowBounds) {
    this.expandedBounds = { ...expandedBounds };
  }

  recordManualBounds(bounds: WindowBounds): void {
    if (this.mode === 'expanded') this.expandedBounds = { ...bounds };
    else this.simpleAnchor = { x: bounds.x, y: bounds.y, width: bounds.width };
  }

  referenceBounds(mode: WindowLayoutInput['mode'], currentBounds: WindowBounds): WindowBounds {
    if (mode === 'expanded' && this.mode === 'simple') return { ...this.expandedBounds };
    if (mode === 'simple' && this.simpleAnchor) return { ...this.simpleAnchor, height: simpleSearchHeight };
    return currentBounds;
  }

  update(input: WindowLayoutInput, currentBounds: WindowBounds, workArea: WindowBounds): WindowLayout {
    const previousMode = this.mode;
    const minimumWidth = Math.min(460, workArea.width);
    this.mode = input.mode;
    if (input.mode === 'simple') {
      if (previousMode === 'expanded') {
        this.expandedBounds = { ...currentBounds };
        if (!this.simpleAnchor) {
          const width = Math.min(640, workArea.width);
          this.simpleAnchor = { x: currentBounds.x + (currentBounds.width - width) / 2, y: currentBounds.y, width };
        }
      }
      const anchor = this.simpleAnchor!;
      return {
        bounds: clampWindowBounds({ ...anchor, width: Math.max(minimumWidth, anchor.width), height: simpleWindowHeight(input) }, workArea),
        minimumWidth,
        minimumHeight: Math.min(simpleSearchHeight, workArea.height),
      };
    }
    if (previousMode === 'expanded') this.expandedBounds = { ...currentBounds };
    const minimumHeight = Math.min(600, workArea.height);
    return {
      bounds: clampWindowBounds({ ...this.expandedBounds, width: Math.max(minimumWidth, this.expandedBounds.width), height: Math.max(minimumHeight, this.expandedBounds.height) }, workArea),
      minimumWidth,
      minimumHeight,
    };
  }
}
