import { useRef, useState } from 'react';
import {
  BookMarked,
  BookOpen,
  Clock,
  FileCode2,
  FileText,
  FileType,
  Settings,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type { AiSettings, DocFormat, DocumentSummary } from '../../types';
import { READING_FONT_MAP } from '../../constants/fonts';
import { detectDocFormat, formatFileSize } from '../../services/fileParser';
import { isAiConfigured } from '../../services/aiService';

interface HomeViewProps {
  recentDocs: DocumentSummary[];
  aiSettings: AiSettings;
  isImporting: boolean;
  onImportFile: (file: File) => void;
  onOpenSampleDoc: () => void;
  onOpenDocument: (docId: string) => void;
  onDeleteDocument: (docId: string) => void;
  onOpenSettings: () => void;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function FormatBadge({ format }: { format: DocFormat }) {
  const meta: Record<DocFormat, { label: string; icon: typeof FileText }> = {
    pdf: { label: 'PDF', icon: FileText },
    docx: { label: 'DOCX', icon: FileType },
    md: { label: 'MD', icon: FileCode2 },
    epub: { label: 'EPUB', icon: BookMarked },
  };
  const { label, icon: Icon } = meta[format];

  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wider"
      style={{
        backgroundColor: 'var(--surface-subtle)',
        color: 'var(--on-surface-muted)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <Icon className="h-3 w-3" />
      <span>{label}</span>
    </span>
  );
}

export function HomeView({
  recentDocs,
  aiSettings,
  isImporting,
  onImportFile,
  onOpenSampleDoc,
  onOpenDocument,
  onDeleteDocument,
  onOpenSettings,
}: HomeViewProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [errorTip, setErrorTip] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const fmt = detectDocFormat(file.name);
    if (!fmt) {
      setErrorTip(`暂不支持 “${file.name}” 的格式，目前支持 .pdf、.docx、.md 与 .epub 文件。`);
      return;
    }
    setErrorTip(null);
    onImportFile(file);
  };

  const configured = isAiConfigured(aiSettings);

  return (
    <div
      className="lumina-scroll relative min-h-screen w-full overflow-y-auto transition-colors duration-200"
      style={{ backgroundColor: 'var(--surface)', color: 'var(--on-surface)' }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) {
          setIsDragging(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      {/* 极简顶部栏 */}
      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-xl border"
            style={{
              backgroundColor: 'var(--surface-subtle)',
              borderColor: 'var(--border)',
              color: 'var(--primary)',
            }}
          >
            <BookOpen className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Lumina Reader</span>
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          title="设置"
          aria-label="设置"
          className="relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border transition hover:bg-black/5 dark:hover:bg-white/10"
          style={{ borderColor: 'var(--border)', color: 'var(--on-surface-muted)' }}
        >
          <Settings className="h-4 w-4" />
          {!configured && (
            <span
              className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: 'var(--tertiary)' }}
            />
          )}
        </button>
      </header>

      {/* 中央主区域 */}
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-10">
        <div className="mb-10 text-center">
          <h1
            className="text-3xl font-semibold tracking-tight sm:text-4xl"
            style={{
              fontFamily: READING_FONT_MAP['claude-serif'].fontFamily,
              color: 'var(--on-surface)',
            }}
          >
            安静地阅读，自然地思考
          </h1>
          <p className="mt-3 text-sm" style={{ color: 'var(--on-surface-muted)' }}>
            纯本地解析 PDF、Word 与 Markdown，指尖划词即现上下文中文译文与伴读洞见
          </p>
        </div>

        {/* 极简文件拖拽导入区 */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-12 text-center transition-all duration-200"
          style={{
            borderColor: isDragging ? 'var(--primary)' : 'var(--border)',
            backgroundColor: isDragging ? 'var(--primary-soft)' : 'var(--surface-subtle)',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.md,.markdown,.epub"
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />

          <div
            className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border transition-transform duration-200 group-hover:-translate-y-0.5"
            style={{
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--primary)',
            }}
          >
            <Upload className="h-5 w-5" />
          </div>

          <p className="text-sm font-medium" style={{ color: 'var(--on-surface)' }}>
            {isImporting ? '正在导入并索引文档...' : '点击选择或将文件拖放到此处'}
          </p>
          <p className="mt-1.5 text-xs" style={{ color: 'var(--on-surface-muted)' }}>
            支持 .pdf · .docx · .md · .epub，所有文件仅保留在您的本地浏览器 IndexedDB 中
          </p>
        </div>

        {errorTip && (
          <p className="mt-3 text-center text-xs" style={{ color: 'var(--error)' }}>
            {errorTip}
          </p>
        )}

        {/* 内置双语示例快速体验入口 */}
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={onOpenSampleDoc}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
            style={{ color: 'var(--primary)' }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>试读内置双语示例《The Art of Slow Reading》</span>
          </button>
        </div>

        {/* 最近阅读记录 */}
        <section className="mt-14">
          <div className="mb-4 flex items-center justify-between">
            <h2
              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--on-surface-muted)' }}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>最近阅读</span>
            </h2>
            {recentDocs.length > 0 && (
              <span className="text-xs" style={{ color: 'var(--on-surface-muted)' }}>
                {recentDocs.length} 份本地文档
              </span>
            )}
          </div>

          {recentDocs.length === 0 ? (
            <div
              className="rounded-2xl border px-6 py-10 text-center text-xs"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--surface-subtle)',
                color: 'var(--on-surface-muted)',
              }}
            >
              还没有最近阅读记录，导入一份本地文档或先试读上方双语示例吧。
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentDocs.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => onOpenDocument(doc.id)}
                  className="group flex cursor-pointer items-center justify-between gap-4 rounded-2xl border px-4 py-3.5 transition hover:shadow-sm"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderColor: 'var(--border)',
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <FormatBadge format={doc.format} />
                      <h3
                        className="truncate text-sm font-medium"
                        style={{ color: 'var(--on-surface)' }}
                      >
                        {doc.title}
                      </h3>
                    </div>

                    <div
                      className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]"
                      style={{ color: 'var(--on-surface-muted)' }}
                    >
                      <span>{formatRelativeTime(doc.lastOpenedAt)}</span>
                      <span>{formatFileSize(doc.fileSize)}</span>
                      {typeof doc.estimatedMinutes === 'number' && doc.estimatedMinutes > 0 && (
                        <span title={doc.wordCount ? `约 ${doc.wordCount.toLocaleString()} 字词` : undefined}>
                          约 {doc.estimatedMinutes} 分钟
                        </span>
                      )}
                      {doc.format === 'pdf' && doc.totalPages ? (
                        <span>
                          第 {doc.currentPage ?? 1} / {doc.totalPages} 页
                        </span>
                      ) : null}
                      {(doc.noteCount ?? 0) > 0 && <span>{doc.noteCount} 条笔记</span>}
                      {(doc.flashcardCount ?? 0) > 0 && <span>{doc.flashcardCount} 张闪卡</span>}
                    </div>
                  </div>

                  {/* 进度条与操作 */}
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="hidden w-24 sm:block">
                      <div
                        className="mb-1 flex justify-end text-[11px] tabular-nums"
                        style={{ color: 'var(--on-surface-muted)' }}
                      >
                        {Math.round(doc.progress)}%
                      </div>
                      <div
                        className="h-1.5 w-full overflow-hidden rounded-full"
                        style={{ backgroundColor: 'var(--surface-subtle)' }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.max(3, Math.round(doc.progress))}%`,
                            backgroundColor: 'var(--primary)',
                          }}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteDocument(doc.id);
                      }}
                      title="从最近阅读移除"
                      className="cursor-pointer rounded-lg p-1.5 opacity-0 transition hover:bg-black/5 group-hover:opacity-100 dark:hover:bg-white/10"
                      style={{ color: 'var(--on-surface-muted)' }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
