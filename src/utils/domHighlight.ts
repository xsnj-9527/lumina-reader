import type { NoteItem } from '../types';

interface TextSegment {
  node: Text;
  start: number;
  end: number;
}

/**
 * 清除容器内现有的高亮 <mark> 元素并合并相邻文本节点，保持 DOM 干净无污染。
 */
export function clearDomHighlights(container: HTMLElement): void {
  const marks = container.querySelectorAll('mark.lumina-highlight');
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize();
  });
}

function collectTextSegments(container: HTMLElement): {
  segments: TextSegment[];
  fullText: string;
} {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('mark.lumina-highlight, script, style, button')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const segments: TextSegment[] = [];
  let fullText = '';
  let current = walker.nextNode() as Text | null;
  while (current) {
    const len = current.nodeValue?.length ?? 0;
    if (len > 0) {
      segments.push({
        node: current,
        start: fullText.length,
        end: fullText.length + len,
      });
      fullText += current.nodeValue;
    }
    current = walker.nextNode() as Text | null;
  }

  return { segments, fullText };
}

function findBestMatchRange(
  fullText: string,
  candidates: string[],
  prefix?: string,
  suffix?: string,
): { start: number; end: number } | null {
  for (const needle of candidates) {
    if (!needle) continue;

    // 先做精确子串匹配，并结合 prefix / suffix 消歧
    const matches: number[] = [];
    let from = 0;
    while (from < fullText.length) {
      const idx = fullText.indexOf(needle, from);
      if (idx === -1) break;
      matches.push(idx);
      from = idx + Math.max(1, needle.length);
    }

    if (matches.length > 0) {
      if (matches.length === 1 || (!prefix && !suffix)) {
        return { start: matches[0], end: matches[0] + needle.length };
      }

      let bestIdx = matches[0];
      let bestScore = -1;
      for (const idx of matches) {
        let score = 0;
        if (prefix) {
          const preWindow = fullText.slice(Math.max(0, idx - prefix.length - 20), idx);
          if (preWindow.includes(prefix)) score += 2;
        }
        if (suffix) {
          const postWindow = fullText.slice(
            idx + needle.length,
            idx + needle.length + suffix.length + 20,
          );
          if (postWindow.includes(suffix)) score += 2;
        }
        if (score > bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      }
      return { start: bestIdx, end: bestIdx + needle.length };
    }

    // 精确匹配未命中时，允许空白符弹性匹配（适配跨标签或软换行差异）
    const tokens = needle.trim().split(/\s+/).filter(Boolean);
    if (tokens.length > 0 && tokens.length <= 180) {
      const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
      try {
        const regex = new RegExp(escaped);
        const match = regex.exec(fullText);
        if (match) {
          return { start: match.index, end: match.index + match[0].length };
        }
      } catch {
        // 正则过长或特殊情况下静默跳过
      }
    }
  }

  return null;
}

/**
 * 为 DOCX / Markdown 流式阅读容器注入持久化划词高亮 <mark>。
 */
export function applyDomHighlights(container: HTMLElement, notes: NoteItem[]): void {
  clearDomHighlights(container);

  const flowNotes = notes.filter((n) => !n.anchor.pdfRects || n.anchor.pdfRects.length === 0);
  if (flowNotes.length === 0) return;

  for (const note of flowNotes) {
    const { segments, fullText } = collectTextSegments(container);
    if (!fullText) continue;

    const candidates = Array.from(
      new Set([note.rawQuote ?? '', note.quote].map((s) => s.trim()).filter(Boolean)),
    );
    const rangeMatch = findBestMatchRange(
      fullText,
      candidates,
      note.anchor.prefix,
      note.anchor.suffix,
    );
    if (!rangeMatch) continue;

    // 逆序处理涉及的 TextNode，避免拆分后偏移失效
    const overlapping = segments.filter(
      (seg) => seg.end > rangeMatch.start && seg.start < rangeMatch.end,
    );

    for (let i = overlapping.length - 1; i >= 0; i -= 1) {
      const seg = overlapping[i];
      const localStart = Math.max(0, rangeMatch.start - seg.start);
      const localEnd = Math.min(seg.end - seg.start, rangeMatch.end - seg.start);
      if (localEnd <= localStart) continue;

      const textNode = seg.node;
      if (!textNode.parentNode) continue;

      let targetNode = textNode;
      if (localEnd < textNode.length) {
        targetNode.splitText(localEnd);
      }
      if (localStart > 0) {
        targetNode = targetNode.splitText(localStart);
      }

      const mark = document.createElement('mark');
      mark.className = 'lumina-highlight';
      mark.dataset.noteId = note.id;
      mark.dataset.noteType = note.type;
      mark.dataset.noteColor = note.color || 'amber';
      const titleParts = [
        note.translation ? `译文：${note.translation}` : '',
        note.annotation ? `批注：${note.annotation}` : '',
      ].filter(Boolean);
      mark.title = titleParts.length > 0 ? titleParts.join('\n') : '点击定位笔记';

      targetNode.parentNode?.replaceChild(mark, targetNode);
      mark.appendChild(targetNode);
    }
  }
}

/**
 * 平滑滚动到指定的 DOM 高亮位置，并播放短暂脉冲提示。
 */
export function scrollToDomHighlight(container: HTMLElement, noteId: string): boolean {
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(noteId) : noteId;
  const el = container.querySelector(`mark.lumina-highlight[data-note-id="${escaped}"]`) as HTMLElement | null;
  if (!el) return false;

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const allParts = container.querySelectorAll(`mark.lumina-highlight[data-note-id="${escaped}"]`);
  allParts.forEach((part) => {
    part.classList.remove('lumina-highlight-pulse');
    void (part as HTMLElement).offsetWidth;
    part.classList.add('lumina-highlight-pulse');
  });

  window.setTimeout(() => {
    allParts.forEach((part) => part.classList.remove('lumina-highlight-pulse'));
  }, 1500);

  return true;
}
