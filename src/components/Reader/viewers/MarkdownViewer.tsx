import { useEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';
import type { NoteItem, TocItem } from '../../../types';
import { applyDomHighlights } from '../../../utils/domHighlight';
import { interceptExternalLinkClick, isExternalHttpUrl } from '../../../utils/externalLink';

interface MarkdownViewerProps {
  content: string;
  maxWidth: number;
  toc: TocItem[];
  notes: NoteItem[];
  onActiveHeadingChange?: (headingId: string) => void;
  onNoteClick?: (noteId: string) => void;
}

function CodeBlock({ className, children }: { className?: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const text = String(children ?? '').replace(/\n$/, '');
  const langMatch = /language-(\w+)/.exec(className || '');

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className="group relative my-5 overflow-hidden rounded-xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--code-bg)' }}>
      <div
        className="flex items-center justify-between border-b px-3.5 py-1.5 text-[11px]"
        style={{ borderColor: 'var(--border)', color: 'var(--on-surface-muted)' }}
      >
        <span className="font-mono uppercase tracking-wider">{langMatch?.[1] ?? 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition hover:opacity-80"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <pre className="!my-0 !rounded-none !border-0 !bg-transparent p-4">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

export function MarkdownViewer({
  content,
  maxWidth,
  toc,
  notes,
  onActiveHeadingChange,
  onNoteClick,
}: MarkdownViewerProps) {
  const articleRef = useRef<HTMLElement | null>(null);

  // 为渲染出来的 h1~h4 注入与目录解析器一致的确定性 ID，兼容 React StrictMode
  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;

    const headings = el.querySelectorAll('h1, h2, h3, h4');
    headings.forEach((h, idx) => {
      h.id = `md-h-${idx}`;
    });

    applyDomHighlights(el, notes);
  }, [content, notes]);

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
  }, [content, toc, onActiveHeadingChange]);

  return (
    <article
      ref={articleRef}
      style={{ maxWidth: `${maxWidth}px` }}
      className="lumina-prose mx-auto w-full px-6 pb-36 pt-12 sm:px-10"
      onClick={(e) => {
        if (interceptExternalLinkClick(e)) return;
        const target = e.target as HTMLElement;
        const mark = target.closest('mark.lumina-highlight') as HTMLElement | null;
        if (mark?.dataset.noteId) {
          onNoteClick?.(mark.dataset.noteId);
        }
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children, ...props }) {
            const external = href ? isExternalHttpUrl(href) : false;
            return (
              <a
                href={href}
                title={external ? `在默认浏览器中打开：${href}` : props.title}
                rel={external ? 'noopener noreferrer' : props.rel}
                {...props}
              >
                {children}
              </a>
            );
          },
          pre({ children }) {
            return <>{children}</>;
          },
          code({ className, children, ...props }) {
            const isBlock = Boolean(className?.includes('language-')) || String(children).includes('\n');
            if (isBlock) {
              return <CodeBlock className={className}>{children}</CodeBlock>;
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
