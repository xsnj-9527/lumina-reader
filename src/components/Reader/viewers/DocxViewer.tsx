import { useEffect, useRef } from 'react';
import type { NoteItem, TocItem } from '../../../types';
import { applyDomHighlights } from '../../../utils/domHighlight';
import { interceptExternalLinkClick } from '../../../utils/externalLink';

interface DocxViewerProps {
  html: string;
  maxWidth: number;
  toc: TocItem[];
  notes: NoteItem[];
  onActiveHeadingChange?: (headingId: string) => void;
  onNoteClick?: (noteId: string) => void;
}

export function DocxViewer({
  html,
  maxWidth,
  toc,
  notes,
  onActiveHeadingChange,
  onNoteClick,
}: DocxViewerProps) {
  const articleRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;
    applyDomHighlights(el, notes);
  }, [html, notes]);

  useEffect(() => {
    const el = articleRef.current;
    if (!el || !onActiveHeadingChange || toc.length === 0) return;

    const headings = Array.from(el.querySelectorAll('h1[id], h2[id], h3[id], h4[id]'));
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0 && visible[0].target.id) {
          onActiveHeadingChange(visible[0].target.id);
        }
      },
      { rootMargin: '-12% 0px -70% 0px', threshold: 0.1 },
    );

    headings.forEach((h) => observer.observe(h));
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
        const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
        if (anchor) {
          const href = anchor.getAttribute('href') ?? '';
          if (href.startsWith('#')) {
            e.preventDefault();
            const dest = document.getElementById(href.slice(1));
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
