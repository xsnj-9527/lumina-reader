import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Code2, Copy, Download, Eye, X } from 'lucide-react';
import type { FlashcardItem, NoteItem } from '../../types';
import { downloadMarkdownFile, generateNotesMarkdown } from '../../utils/markdownExporter';

interface ExportModalProps {
  isOpen: boolean;
  docTitle: string;
  fileName: string;
  notes: NoteItem[];
  flashcards: FlashcardItem[];
  onClose: () => void;
}

export function ExportModal({
  isOpen,
  docTitle,
  fileName,
  notes,
  flashcards,
  onClose,
}: ExportModalProps) {
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');
  const [copied, setCopied] = useState(false);

  const markdown = useMemo(
    () => generateNotesMarkdown(docTitle, notes, flashcards),
    [docTitle, notes, flashcards],
  );

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(markdown).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  };

  const handleDownload = () => {
    downloadMarkdownFile(fileName || docTitle, markdown);
  };

  return (
    <div
      data-floating-ui="true"
      className="lumina-animate-fade fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="lumina-animate-pop flex max-h-[84vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border"
        style={{
          backgroundColor: 'var(--surface-elevated)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-popover)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--on-surface)' }}>
              导出阅读笔记
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--on-surface-muted)' }}>
              共 {notes.length} 条高亮与译文、{flashcards.length} 张问答闪卡
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div
              className="flex rounded-lg p-0.5"
              style={{ backgroundColor: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)' }}
            >
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition"
                style={{
                  backgroundColor: viewMode === 'preview' ? 'var(--surface)' : 'transparent',
                  color: viewMode === 'preview' ? 'var(--on-surface)' : 'var(--on-surface-muted)',
                }}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>渲染预览</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('raw')}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition"
                style={{
                  backgroundColor: viewMode === 'raw' ? 'var(--surface)' : 'transparent',
                  color: viewMode === 'raw' ? 'var(--on-surface)' : 'var(--on-surface-muted)',
                }}
              >
                <Code2 className="h-3.5 w-3.5" />
                <span>源码</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="关闭导出弹窗"
              className="cursor-pointer rounded-lg p-1.5 transition hover:bg-black/5 dark:hover:bg-white/10"
              style={{ color: 'var(--on-surface-muted)' }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="lumina-scroll flex-1 overflow-y-auto px-6 py-5">
          {viewMode === 'preview' ? (
            <div className="lumina-ai-prose text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
            </div>
          ) : (
            <pre
              className="whitespace-pre-wrap rounded-xl border p-4 font-mono text-xs leading-relaxed"
              style={{
                backgroundColor: 'var(--surface-subtle)',
                borderColor: 'var(--border)',
                color: 'var(--on-surface)',
              }}
            >
              {markdown}
            </pre>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2.5 border-t px-6 py-3.5"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--surface-subtle)' }}
        >
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
            style={{ borderColor: 'var(--border)', color: 'var(--on-surface)' }}
          >
            {copied ? <Check className="h-3.5 w-3.5" style={{ color: 'var(--primary)' }} /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? '已复制 Markdown' : '复制内容'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium text-white transition hover:brightness-110"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            <Download className="h-3.5 w-3.5" />
            <span>导出 .md 文件</span>
          </button>
        </div>
      </div>
    </div>
  );
}
