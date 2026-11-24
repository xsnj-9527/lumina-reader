import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { DocFormat, FloatingPosition, NoteAnchor, PdfHighlightRect, SelectionInfo } from '../types';
import { cleanSelectedText, extractContextParagraph } from '../utils/textCleaner';

interface UseTextSelectionOptions {
  containerRef: RefObject<HTMLElement | null>;
  format: DocFormat;
  enabled?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  if (min > max) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * 合并同一行相邻的 PDF 选区矩形，消除跨 span 造成的锯齿与重叠加深。
 */
function mergeLineRects(rects: PdfHighlightRect[]): PdfHighlightRect[] {
  if (rects.length <= 1) return rects;
  const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left);
  const merged: PdfHighlightRect[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const curr = sorted[i];
    const prev = merged[merged.length - 1];
    const prevCenterY = prev.top + prev.height / 2;
    const currCenterY = curr.top + curr.height / 2;
    const sameLine = Math.abs(prevCenterY - currCenterY) <= Math.max(prev.height, curr.height) * 0.55;
    const closeHorizontally = curr.left <= prev.left + prev.width + 0.015;

    if (sameLine && closeHorizontally) {
      const right = Math.max(prev.left + prev.width, curr.left + curr.width);
      const bottom = Math.max(prev.top + prev.height, curr.top + curr.height);
      prev.left = Math.min(prev.left, curr.left);
      prev.top = Math.min(prev.top, curr.top);
      prev.width = right - prev.left;
      prev.height = bottom - prev.top;
    } else {
      merged.push(curr);
    }
  }

  return merged;
}

function computeSelectionBoundingRect(range: Range): DOMRect {
  const clientRects = Array.from(range.getClientRects()).filter(
    (r) => r.width >= 1 && r.height >= 1,
  );
  if (clientRects.length === 0) {
    return range.getBoundingClientRect();
  }
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const r of clientRects) {
    if (r.left < left) left = r.left;
    if (r.top < top) top = r.top;
    if (r.right > right) right = r.right;
    if (r.bottom > bottom) bottom = r.bottom;
  }

  return new DOMRect(left, top, right - left, bottom - top);
}

function computeToolbarPosition(box: DOMRect): FloatingPosition {
  const vw = window.innerWidth;
  const halfToolbar = 190;
  const centerX = box.left + box.width / 2;
  const x = clamp(centerX, 16 + halfToolbar, vw - 16 - halfToolbar);

  // 顶部栏约占 56px，留出充足空间不与悬浮条相撞
  if (box.top < 118) {
    return {
      x,
      y: Math.min(window.innerHeight - 64, box.bottom + 12),
      placement: 'bottom',
    };
  }

  return {
    x,
    y: box.top - 12,
    placement: 'top',
  };
}

function computePopoverPosition(box: DOMRect): FloatingPosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const halfPopover = Math.min(205, (vw - 24) / 2);
  const centerX = box.left + box.width / 2;
  const x = clamp(centerX, 12 + halfPopover, vw - 12 - halfPopover);

  const spaceBelow = vh - box.bottom;
  const spaceAbove = box.top;

  if (spaceBelow < 240 && spaceAbove > 250) {
    return {
      x,
      y: Math.max(72, box.top - 10),
      placement: 'top',
    };
  }

  return {
    x,
    y: Math.min(vh - 24, box.bottom + 10),
    placement: 'bottom',
  };
}

export function useTextSelection({
  containerRef,
  format,
  enabled = true,
}: UseTextSelectionOptions) {
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearSelection = useCallback(() => {
    setSelectionInfo(null);
  }, []);

  const readCurrentSelection = useCallback(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setSelectionInfo(null);
      return;
    }

    const rawText = sel.toString();
    if (!rawText || !rawText.trim()) {
      setSelectionInfo(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const commonEl =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as HTMLElement)
        : range.commonAncestorContainer.parentElement;

    if (!commonEl || !container.contains(commonEl)) {
      return;
    }
    if (commonEl.closest('[data-floating-ui="true"]')) {
      return;
    }

    const isPdf = format === 'pdf';
    const cleanedText = cleanSelectedText(rawText, isPdf);
    if (!cleanedText) {
      setSelectionInfo(null);
      return;
    }

    const box = computeSelectionBoundingRect(range);
    if (box.width === 0 && box.height === 0) {
      setSelectionInfo(null);
      return;
    }

    const { context, prefix, suffix } = extractContextParagraph(sel, container, isPdf);

    const anchor: NoteAnchor = { prefix, suffix };
    if (isPdf) {
      const startEl =
        range.startContainer.nodeType === Node.ELEMENT_NODE
          ? (range.startContainer as HTMLElement)
          : range.startContainer.parentElement;
      const pageEl = startEl?.closest('[data-page-number]') as HTMLElement | null;
      if (pageEl) {
        const pageNumber = Number.parseInt(pageEl.dataset.pageNumber ?? '1', 10) || 1;
        const pageRect = pageEl.getBoundingClientRect();
        if (pageRect.width > 0 && pageRect.height > 0) {
          const rawRects = Array.from(range.getClientRects())
            .filter((r) => r.width >= 2 && r.height >= 2)
            .filter(
              (r) =>
                r.right >= pageRect.left &&
                r.left <= pageRect.right &&
                r.bottom >= pageRect.top &&
                r.top <= pageRect.bottom,
            )
            .map((r) => ({
              left: clamp((r.left - pageRect.left) / pageRect.width, 0, 1),
              top: clamp((r.top - pageRect.top) / pageRect.height, 0, 1),
              width: clamp(r.width / pageRect.width, 0, 1),
              height: clamp(r.height / pageRect.height, 0, 1),
            }));
          anchor.pageNumber = pageNumber;
          anchor.pdfRects = mergeLineRects(rawRects);
        }
      }
    }

    setSelectionInfo({
      text: cleanedText,
      rawText,
      context,
      toolbarPosition: computeToolbarPosition(box),
      popoverPosition: computePopoverPosition(box),
      anchor,
    });
  }, [containerRef, enabled, format]);

  useEffect(() => {
    if (!enabled) {
      setSelectionInfo(null);
      return;
    }

    const scheduleCheck = (target: EventTarget | null) => {
      if (target instanceof Element && target.closest('[data-floating-ui="true"]')) {
        return;
      }
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        readCurrentSelection();
      }, 28);
    };

    const handleMouseUp = (e: MouseEvent) => scheduleCheck(e.target);
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectionInfo(null);
        return;
      }
      if (e.shiftKey || e.key.startsWith('Arrow')) {
        scheduleCheck(e.target);
      }
    };
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelectionInfo(null);
      }
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-floating-ui="true"]')) {
        return;
      }
      // 开始新的拖拽或点击空白处时立即隐藏旧悬浮栏
      setSelectionInfo(null);
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [enabled, readCurrentSelection]);

  return { selectionInfo, clearSelection };
}
