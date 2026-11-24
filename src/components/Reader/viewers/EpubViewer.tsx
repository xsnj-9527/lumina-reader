import { useEffect, useRef } from 'react';
import type { NoteItem, TocItem } from '../../../types';
import { applyDomHighlights } from '../../../utils/domHighlight';
import { interceptExternalLinkClick } from '../../../utils/externalLink';

interface EpubViewerProps {
  html: string;
  maxWidth: number;
  toc: TocItem[];
  notes: NoteItem[];
  onActiveHeadingChange?: (headingId: string) => void;
  onNoteClick?: (noteId: string) => void;
}

export function EpubViewer({
  html,
  maxWidth,
  toc,
  notes,
  onActiveHeadingChange,
  onNoteClick,
}: EpubViewerProps) {
  const articleRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;
    applyDomHighlights(el, notes);
  }, [html, notes]);

  useEffect(() => {
    const el = articleRef.current;
    if (!el || !onActiveHeadingChange || toc.length === 0) return;

    const collectTargetIds = (items: TocItem[], acc: string[] = []): string[] => {
      for (const item of items) {
        if (item.id && !item.id.startsWith('epub-nav-group-') && !item.id.startsWith('epub-ncx-group-')) {
          acc.push(item.id);
        }
        if (item.children) collectTargetIds(item.children, acc);
      }
      return acc;
    };

    const targetIds = collectTargetIds(toc);
    const elements = targetIds
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => Boolean(node && el.contains(node)));

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0 && visible[0].target.id) {
          onActiveHeadingChange(visible[0].target.id);
        }
      },
      { rootMargin: '-10% 0px -72% 0px', threshold: 0.05 },
    );

    elements.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [html, toc, onActiveHeadingChange]);

  return (
    <article
      ref={articleRef}
      style={{ maxWidth: `${maxWidth}px` }}
      className="lumina-prose mx-auto w-full px-6 pb-36 pt-12 sm:px-10"
      onClick={(e) => {
        if (interceptExternalLinkClick(e)) return;

        const target = e.target as HTMLElement;

        // 拦截书内相对锚点跳转，平滑滚动到章节或指定段落
        const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
        if (anchor) {
          const href = anchor.getAttribute('href') ?? '';
          if (href.startsWith('#')) {
            e.preventDefault();
            const targetId = href.slice(1);
            const dest = document.getElementById(targetId);
            dest?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
          }
        }

        const mark = target.closest('mark.lumina-highlight') as HTMLElement | null;
        if (mark?.dataset.noteId) {
          onNoteClick?.(mark.dataset.noteId);
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
