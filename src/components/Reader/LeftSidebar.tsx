import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Download,
  Highlighter,
  Languages,
  Layers,
  ListTree,
  PencilLine,
  Plus,
  RotateCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type {
  DocFormat,
  FlashcardItem,
  HighlightColor,
  NoteItem,
  TocItem,
} from '../../types';

export type LeftSidebarTab = 'toc' | 'notes' | 'flashcards';
type NoteFilterType = 'all' | 'translation' | 'highlight';
type NoteColorFilter = 'all' | HighlightColor;

const HIGHLIGHT_COLOR_OPTIONS: Array<{
  id: HighlightColor;
  label: string;
  dotVar: string;
  borderVar: string;
}> = [
  {
    id: 'amber',
    label: '暖琥珀',
    dotVar: 'var(--highlight-amber-dot)',
    borderVar: 'var(--highlight-amber-border)',
  },
  {
    id: 'sage',
    label: '鼠尾草绿',
    dotVar: 'var(--highlight-sage-dot)',
    borderVar: 'var(--highlight-sage-border)',
  },
  {
    id: 'sky',
    label: '雾霭蓝',
    dotVar: 'var(--highlight-sky-dot)',
    borderVar: 'var(--highlight-sky-border)',
  },
];

const HIGHLIGHT_COLOR_MAP: Record<HighlightColor, (typeof HIGHLIGHT_COLOR_OPTIONS)[number]> = {
  amber: HIGHLIGHT_COLOR_OPTIONS[0],
  sage: HIGHLIGHT_COLOR_OPTIONS[1],
  sky: HIGHLIGHT_COLOR_OPTIONS[2],
};

interface LeftSidebarProps {
  docId: string;
  isOpen: boolean;
  activeTab: LeftSidebarTab;
  onTabChange: (tab: LeftSidebarTab) => void;
  format: DocFormat;
  toc: TocItem[];
  activeHeadingId: string | null;
  totalPages?: number;
  notes: NoteItem[];
  flashcards: FlashcardItem[];
  onSelectTocItem: (item: TocItem) => void;
  onJumpToPage?: (pageNumber: number) => void;
  onSelectNote: (note: NoteItem) => void;
  onUpdateNoteAnnotation: (noteId: string, annotation: string) => Promise<void> | void;
  onUpdateNoteColor: (noteId: string, color: HighlightColor) => Promise<void> | void;
  onDeleteNote: (noteId: string) => void;
  onDeleteFlashcard: (cardId: string) => void;
  onOpenExport: () => void;
}

function TocNodeList({
  items,
  activeHeadingId,
  onSelect,
  depth = 0,
}: {
  items: TocItem[];
  activeHeadingId: string | null;
  onSelect: (item: TocItem) => void;
  depth?: number;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const hasChildren = Boolean(item.children && item.children.length > 0);
        const isCollapsed = Boolean(collapsed[item.id]);
        const isActive = activeHeadingId === item.id;

        return (
          <li key={item.id}>
            <div
              className="group flex items-center gap-1 rounded-lg pr-2 transition hover:bg-black/5 dark:hover:bg-white/5"
              style={{
                paddingLeft: `${8 + depth * 12}px`,
                backgroundColor: isActive ? 'var(--primary-soft)' : undefined,
              }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => setCollapsed((p) => ({ ...p, [item.id]: !isCollapsed }))}
                  className="cursor-pointer rounded p-0.5 opacity-60 hover:opacity-100"
                  style={{ color: 'var(--on-surface-muted)' }}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
              ) : (
                <span className="w-4 shrink-0" />
              )}

              <button
                type="button"
                onClick={() => onSelect(item)}
                className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 py-1.5 text-left text-[12.5px] leading-snug"
                style={{
                  color: isActive ? 'var(--primary)' : 'var(--on-surface)',
                  fontWeight: isActive || item.level === 1 ? 500 : 400,
                }}
              >
                <span className="truncate">{item.title}</span>
                {item.pageNumber ? (
                  <span
                    className="shrink-0 text-[11px] tabular-nums"
                    style={{ color: 'var(--on-surface-muted)' }}
                  >
                    {item.pageNumber}
                  </span>
                ) : null}
              </button>
            </div>

            {hasChildren && !isCollapsed && (
              <TocNodeList
                items={item.children!}
                activeHeadingId={activeHeadingId}
                onSelect={onSelect}
                depth={depth + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function NoteCard({
  note,
  onSelect,
  onUpdateAnnotation,
  onUpdateColor,
  onDelete,
}: {
  note: NoteItem;
  onSelect: (note: NoteItem) => void;
  onUpdateAnnotation: (noteId: string, annotation: string) => Promise<void> | void;
  onUpdateColor: (noteId: string, color: HighlightColor) => Promise<void> | void;
  onDelete: (noteId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(note.annotation ?? '');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const cancelOnBlurRef = useRef(false);
  const noteColor: HighlightColor = note.color || 'amber';
  const colorMeta = HIGHLIGHT_COLOR_MAP[noteColor] ?? HIGHLIGHT_COLOR_MAP.amber;

  useEffect(() => {
    if (!isEditing) {
      setDraft(note.annotation ?? '');
    }
  }, [note.annotation, isEditing]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [isEditing]);

  const startEditing = () => {
    cancelOnBlurRef.current = false;
    setDraft(note.annotation ?? '');
    setIsEditing(true);
  };

  const commitEdit = () => {
    if (cancelOnBlurRef.current) {
      cancelOnBlurRef.current = false;
      return;
    }
    const next = draft.trim();
    const prev = (note.annotation ?? '').trim();
    setIsEditing(false);
    if (next !== prev) {
      void onUpdateAnnotation(note.id, next);
    }
  };

  const cancelEdit = () => {
    cancelOnBlurRef.current = true;
    setDraft(note.annotation ?? '');
    setIsEditing(false);
  };

  return (
    <div
      onClick={() => onSelect(note)}
      className="group cursor-pointer rounded-xl border p-3 transition hover:shadow-sm"
      style={{
        backgroundColor: 'var(--surface)',
        borderColor: isEditing ? 'var(--primary)' : 'var(--border)',
      }}
    >
      {/* 卡片头部：类型、页码、颜色切换点与悬浮操作 */}
      <div className="mb-1.5 flex items-center justify-between">
        <span
          className="inline-flex items-center gap-1 text-[11px] font-medium"
          style={{ color: note.type === 'translation' ? 'var(--primary)' : colorMeta.dotVar }}
        >
          {note.type === 'translation' ? (
            <Languages className="h-3 w-3" />
          ) : (
            <Highlighter className="h-3 w-3" />
          )}
          <span>{note.type === 'translation' ? '双语笔记' : '高亮摘录'}</span>
          {note.anchor.pageNumber ? (
            <span style={{ color: 'var(--on-surface-muted)' }}>· P.{note.anchor.pageNumber}</span>
          ) : null}
        </span>

        <div className="flex items-center gap-1">
          {/* 一键切换 3 色纸感高亮色点 */}
          <div
            className="mr-0.5 flex items-center gap-1 opacity-40 transition-opacity group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.preventDefault()}
          >
            {HIGHLIGHT_COLOR_OPTIONS.map((c) => {
              const active = noteColor === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    if (!active) void onUpdateColor(note.id, c.id);
                  }}
                  title={`切换为${c.label}`}
                  aria-label={`切换为${c.label}`}
                  className="h-2.5 w-2.5 cursor-pointer rounded-full transition-transform hover:scale-125"
                  style={{
                    backgroundColor: c.dotVar,
                    boxShadow: active
                      ? '0 0 0 1.5px var(--surface), 0 0 0 2.5px var(--primary)'
                      : 'none',
                  }}
                />
              );
            })}
          </div>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              startEditing();
            }}
            title={note.annotation ? '编辑批注' : '添加批注'}
            aria-label={note.annotation ? '编辑批注' : '添加批注'}
            className="cursor-pointer rounded p-1 opacity-0 transition hover:bg-black/5 group-hover:opacity-100 dark:hover:bg-white/10"
            style={{ color: 'var(--on-surface-muted)' }}
          >
            <PencilLine className="h-3 w-3" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(note.id);
            }}
            title="删除笔记"
            aria-label="删除笔记"
            className="cursor-pointer rounded p-1 opacity-0 transition hover:bg-black/5 group-hover:opacity-100 dark:hover:bg-white/10"
            style={{ color: 'var(--on-surface-muted)' }}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* 原文摘录 */}
      <p
        className="line-clamp-3 border-l-2 pl-2 text-xs leading-relaxed"
        style={{
          borderColor: colorMeta.borderVar,
          color: 'var(--on-surface-muted)',
        }}
      >
        {note.quote}
      </p>

      {/* 中文译文 */}
      {note.translation && (
        <p
          className="mt-2 line-clamp-4 text-xs leading-relaxed"
          style={{ color: 'var(--on-surface)' }}
        >
          {note.translation}
        </p>
      )}

      {/* 行内个人批注区（阻止事件冒泡，避免误触定位滚动） */}
      <div
        className="mt-2.5 border-t pt-2"
        style={{ borderColor: 'var(--border-subtle)' }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {isEditing ? (
          <div className="space-y-1">
            <textarea
              ref={textareaRef}
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  commitEdit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  cancelEdit();
                }
              }}
              placeholder="写下你的批注想法..."
              className="lumina-scroll w-full resize-none rounded-lg border px-2.5 py-1.5 text-xs leading-relaxed outline-none"
              style={{
                backgroundColor: 'var(--surface-subtle)',
                borderColor: 'var(--primary)',
                color: 'var(--on-surface)',
              }}
            />
            <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--on-surface-muted)' }}>
              <span>⌘/Ctrl + Enter 或失焦保存</span>
              <span>Esc 取消</span>
            </div>
          </div>
        ) : note.annotation ? (
          <button
            type="button"
            onClick={startEditing}
            title="点击修改批注"
            className="w-full cursor-text rounded-lg px-2.5 py-1.5 text-left text-xs leading-relaxed transition hover:brightness-95"
            style={{
              backgroundColor: 'var(--surface-subtle)',
              color: 'var(--on-surface)',
            }}
          >
            <span className="mr-1.5 inline-flex items-center gap-1 align-middle text-[10.5px] font-medium" style={{ color: 'var(--primary)' }}>
              <PencilLine className="h-2.5 w-2.5" />
              批注
            </span>
            <span className="whitespace-pre-wrap break-words">{note.annotation}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition hover:bg-black/5 dark:hover:bg-white/10"
            style={{ color: 'var(--on-surface-muted)' }}
          >
            <Plus className="h-3 w-3" />
            <span>添加批注</span>
          </button>
        )}
      </div>
    </div>
  );
}

function FlashcardRow({
  card,
  onDelete,
}: {
  card: FlashcardItem;
  onDelete: (id: string) => void;
}) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      className="group relative rounded-xl border p-3 transition hover:shadow-sm"
      style={{
        borderColor: flipped ? 'var(--primary)' : 'var(--border)',
        backgroundColor: 'var(--surface)',
      }}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            backgroundColor: flipped ? 'var(--primary-soft)' : 'var(--surface-subtle)',
            color: flipped ? 'var(--primary)' : 'var(--on-surface-muted)',
          }}
        >
          <RotateCw className="h-2.5 w-2.5" />
          {flipped ? '答案（点击翻回）' : '问题（点击查看答案）'}
        </span>

        <button
          type="button"
          onClick={() => onDelete(card.id)}
          title="删除闪卡"
          className="cursor-pointer rounded p-1 opacity-0 transition hover:bg-black/5 group-hover:opacity-100 dark:hover:bg-white/10"
          style={{ color: 'var(--on-surface-muted)' }}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => setFlipped((v) => !v)}
        className="w-full cursor-pointer text-left text-xs leading-relaxed"
        style={{ color: 'var(--on-surface)' }}
      >
        {flipped ? card.answer : card.question}
      </button>
    </div>
  );
}

export function LeftSidebar({
  docId,
  isOpen,
  activeTab,
  onTabChange,
  format,
  toc,
  activeHeadingId,
  totalPages,
  notes,
  flashcards,
  onSelectTocItem,
  onJumpToPage,
  onSelectNote,
  onUpdateNoteAnnotation,
  onUpdateNoteColor,
  onDeleteNote,
  onDeleteFlashcard,
  onOpenExport,
}: LeftSidebarProps) {
  const [pageInput, setPageInput] = useState('');
  const [noteFilter, setNoteFilter] = useState<NoteFilterType>('all');
  const [colorFilter, setColorFilter] = useState<NoteColorFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setNoteFilter('all');
    setColorFilter('all');
    setSearchQuery('');
  }, [docId]);

  const { translationCount, highlightCount, filteredNotes } = useMemo(() => {
    let translations = 0;
    let highlights = 0;
    const query = searchQuery.trim().toLowerCase();

    const matched = notes.filter((note) => {
      if (note.type === 'translation') translations += 1;
      else highlights += 1;

      if (noteFilter !== 'all' && note.type !== noteFilter) {
        return false;
      }
      const resolvedColor: HighlightColor = note.color || 'amber';
      if (colorFilter !== 'all' && resolvedColor !== colorFilter) {
        return false;
      }
      if (!query) return true;

      const haystack = [note.quote, note.translation, note.annotation]
        .filter(Boolean)
        .join('\n')
        .toLowerCase();
      return haystack.includes(query);
    });

    return {
      translationCount: translations,
      highlightCount: highlights,
      filteredNotes: matched,
    };
  }, [notes, noteFilter, colorFilter, searchQuery]);

  const handlePageJump = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number.parseInt(pageInput, 10);
    if (!Number.isNaN(num) && num >= 1 && (!totalPages || num <= totalPages)) {
      onJumpToPage?.(num);
      setPageInput('');
    }
  };

  return (
    <aside
      className="h-full shrink-0 overflow-hidden border-r transition-[width,opacity] duration-250 ease-out"
      style={{
        width: isOpen ? '284px' : '0px',
        opacity: isOpen ? 1 : 0,
        borderColor: isOpen ? 'var(--border)' : 'transparent',
        backgroundColor: 'var(--surface-subtle)',
      }}
    >
      <div className="flex h-full w-[284px] flex-col pt-14">
        {/* 分段 Tab */}
        <div className="px-3 pb-2.5 pt-2">
          <div
            className="grid grid-cols-3 gap-1 rounded-xl p-1"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border-subtle)' }}
          >
            <button
              type="button"
              onClick={() => onTabChange('toc')}
              className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium transition"
              style={{
                backgroundColor: activeTab === 'toc' ? 'var(--primary-soft)' : 'transparent',
                color: activeTab === 'toc' ? 'var(--primary)' : 'var(--on-surface-muted)',
              }}
            >
              <ListTree className="h-3.5 w-3.5" />
              <span>目录</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange('notes')}
              className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium transition"
              style={{
                backgroundColor: activeTab === 'notes' ? 'var(--primary-soft)' : 'transparent',
                color: activeTab === 'notes' ? 'var(--primary)' : 'var(--on-surface-muted)',
              }}
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>笔记</span>
              {notes.length > 0 && (
                <span className="text-[10px] opacity-80">({notes.length})</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onTabChange('flashcards')}
              className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium transition"
              style={{
                backgroundColor: activeTab === 'flashcards' ? 'var(--primary-soft)' : 'transparent',
                color: activeTab === 'flashcards' ? 'var(--primary)' : 'var(--on-surface-muted)',
              }}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>闪卡</span>
              {flashcards.length > 0 && (
                <span className="text-[10px] opacity-80">({flashcards.length})</span>
              )}
            </button>
          </div>
        </div>

        {/* 内容滚动区 */}
        <div className="lumina-scroll flex-1 overflow-y-auto px-3 pb-4">
          {activeTab === 'toc' && (
            <div className="space-y-3">
              {format === 'pdf' && totalPages && totalPages > 1 && (
                <form onSubmit={handlePageJump} className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value)}
                    placeholder={`跳转页码 (1–${totalPages})`}
                    className="w-full rounded-lg border px-2.5 py-1.5 text-xs outline-none"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderColor: 'var(--border)',
                      color: 'var(--on-surface)',
                    }}
                  />
                  <button
                    type="submit"
                    className="shrink-0 cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
                    style={{ borderColor: 'var(--border)', color: 'var(--on-surface)' }}
                  >
                    跳转
                  </button>
                </form>
              )}

              {toc.length > 0 ? (
                <TocNodeList
                  items={toc}
                  activeHeadingId={activeHeadingId}
                  onSelect={onSelectTocItem}
                />
              ) : (
                <div
                  className="px-2 py-10 text-center text-xs leading-relaxed"
                  style={{ color: 'var(--on-surface-muted)' }}
                >
                  {format === 'pdf'
                    ? '当前 PDF 未内嵌大纲目录，可使用上方页码跳转或划词记录笔记。'
                    : '未在文档中检测到标题层级目录。'}
                </div>
              )}
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="space-y-2.5">
              {notes.length === 0 ? (
                <div
                  className="px-2 py-12 text-center text-xs leading-relaxed"
                  style={{ color: 'var(--on-surface-muted)' }}
                >
                  在正文中划选任意片段，点击「加入高亮」或将原位译文「存笔记」，即可汇集于此。
                </div>
              ) : (
                <>
                  {/* 极简筛选条：关键词过滤 + 类型切换 */}
                  <div className="space-y-2 pb-1">
                    <div
                      className="flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5"
                      style={{
                        backgroundColor: 'var(--surface)',
                        borderColor: 'var(--border)',
                      }}
                    >
                      <Search
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: 'var(--on-surface-muted)' }}
                      />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="搜索原文、译文或批注..."
                        className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                        style={{ color: 'var(--on-surface)' }}
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          aria-label="清空搜索"
                          className="cursor-pointer rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
                          style={{ color: 'var(--on-surface-muted)' }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    <div
                      className="grid grid-cols-3 gap-1 rounded-xl p-0.5"
                      style={{
                        backgroundColor: 'var(--surface)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {(
                        [
                          { id: 'all', label: '全部', count: notes.length },
                          { id: 'translation', label: '双语译文', count: translationCount },
                          { id: 'highlight', label: '高亮', count: highlightCount },
                        ] as const
                      ).map((tab) => {
                        const active = noteFilter === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setNoteFilter(tab.id)}
                            className="cursor-pointer rounded-lg py-1 text-[11px] font-medium transition"
                            style={{
                              backgroundColor: active ? 'var(--primary-soft)' : 'transparent',
                              color: active ? 'var(--primary)' : 'var(--on-surface-muted)',
                            }}
                          >
                            {tab.label}
                            <span className="ml-0.5 opacity-75">({tab.count})</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* 极简按高亮色系筛选 */}
                    <div className="flex items-center justify-between px-0.5 pt-0.5">
                      <span className="text-[11px]" style={{ color: 'var(--on-surface-muted)' }}>
                        高亮颜色
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setColorFilter('all')}
                          className="cursor-pointer rounded-md px-1.5 py-0.5 text-[10.5px] font-medium transition"
                          style={{
                            backgroundColor:
                              colorFilter === 'all' ? 'var(--primary-soft)' : 'transparent',
                            color:
                              colorFilter === 'all' ? 'var(--primary)' : 'var(--on-surface-muted)',
                          }}
                        >
                          全色
                        </button>
                        {HIGHLIGHT_COLOR_OPTIONS.map((c) => {
                          const active = colorFilter === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setColorFilter(c.id)}
                              title={`筛选${c.label}`}
                              aria-label={`筛选${c.label}`}
                              className="h-3.5 w-3.5 cursor-pointer rounded-full transition-transform hover:scale-110"
                              style={{
                                backgroundColor: c.dotVar,
                                boxShadow: active
                                  ? '0 0 0 2px var(--surface-subtle), 0 0 0 3.5px var(--primary)'
                                  : 'none',
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {filteredNotes.length === 0 ? (
                    <div
                      className="space-y-2 px-2 py-10 text-center text-xs"
                      style={{ color: 'var(--on-surface-muted)' }}
                    >
                      <p>未找到匹配的笔记记录</p>
                      <button
                        type="button"
                        onClick={() => {
                          setNoteFilter('all');
                          setColorFilter('all');
                          setSearchQuery('');
                        }}
                        className="cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
                        style={{ color: 'var(--primary)' }}
                      >
                        清空筛选条件
                      </button>
                    </div>
                  ) : (
                    filteredNotes.map((note) => (
                      <NoteCard
                        key={note.id}
                        note={note}
                        onSelect={onSelectNote}
                        onUpdateAnnotation={onUpdateNoteAnnotation}
                        onUpdateColor={onUpdateNoteColor}
                        onDelete={onDeleteNote}
                      />
                    ))
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'flashcards' && (
            <div className="space-y-2.5">
              {flashcards.length === 0 ? (
                <div
                  className="px-2 py-12 text-center text-xs leading-relaxed"
                  style={{ color: 'var(--on-surface-muted)' }}
                >
                  选中重点段落后点击悬浮条的「生成闪卡」，AI 会为您提炼主动回忆问答卡。
                </div>
              ) : (
                flashcards.map((card) => (
                  <FlashcardRow key={card.id} card={card} onDelete={onDeleteFlashcard} />
                ))
              )}
            </div>
          )}
        </div>

        {/* 底部导出栏 */}
        <div
          className="border-t p-3"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-subtle)' }}
        >
          <button
            type="button"
            onClick={onOpenExport}
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
            style={{
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--on-surface)',
            }}
          >
            <Download className="h-3.5 w-3.5" style={{ color: 'var(--primary)' }} />
            <span>导出 Markdown 笔记</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
