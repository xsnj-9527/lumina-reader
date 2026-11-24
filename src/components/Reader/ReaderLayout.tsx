import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type {
  AiSettings,
  ChatMessage,
  ChatThread,
  DocGuideRecord,
  DocumentRecord,
  FlashcardItem,
  HighlightColor,
  NoteAnchor,
  NoteItem,
  QuoteContext,
  ReaderPreferences,
  TocItem,
} from '../../types';
import {
  addFlashcards,
  addNote,
  deleteChatThread,
  deleteFlashcard,
  deleteNote,
  getChatThreadsByDoc,
  getDocGuide,
  getFlashcardsByDoc,
  getNotesByDoc,
  saveChatThread,
  saveDocGuide,
  updateDocumentProgress,
  updateNote,
} from '../../services/db';
import {
  computeReadingStats,
  parseDocxArrayBuffer,
  parseMarkdownArrayBuffer,
} from '../../services/fileParser';
import { parseEpubArrayBuffer } from '../../services/epubParser';
import { isAbortError, isAiConfigured, streamCompletion } from '../../services/aiService';
import {
  buildChatSystemPrompt,
  buildDocGuidePrompt,
  buildExplainPrompt,
  buildFlashcardPrompt,
  buildSlidingWindowHistory,
  buildSummarizePrompt,
  formatTocOutline,
  parseFlashcardsJson,
} from '../../services/prompts';
import {
  buildDocxContextIndex,
  buildMarkdownContextIndex,
  buildStructuredTextContextIndex,
  getOrBuildPdfContextIndex,
  retrieveContextForQuery,
  sampleDocumentForGuide,
  type DocContextIndex,
} from '../../utils/docContextIndex';
import { useTextSelection } from '../../hooks/useTextSelection';
import { scrollToDomHighlight } from '../../utils/domHighlight';
import { TopBar } from './TopBar';
import { LeftSidebar, type LeftSidebarTab } from './LeftSidebar';
import { RightAiSidebar } from './RightAiSidebar';
import { PdfViewer, type PdfViewerHandle } from './viewers/PdfViewer';
import { DocxViewer } from './viewers/DocxViewer';
import { MarkdownViewer } from './viewers/MarkdownViewer';
import { EpubViewer } from './viewers/EpubViewer';
import { SelectionToolbar } from './overlays/SelectionToolbar';
import { TranslationPopover, type TranslationSession } from './overlays/TranslationPopover';
import { ExportModal } from '../Export/ExportModal';
import type { SettingsTab } from '../Settings/SettingsModal';

interface ReaderLayoutProps {
  documentRecord: DocumentRecord;
  preferences: ReaderPreferences;
  aiSettings: AiSettings;
  dataRevision?: number;
  onBackHome: () => void;
  onOpenSettings: (tab?: SettingsTab) => void;
  onSelectChatProfile: (profileId: string) => void;
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function deriveThreadTitle(userText: string, quoteCtx?: QuoteContext | null): string {
  const source =
    userText.trim() || quoteCtx?.actionLabel || quoteCtx?.quote || '新伴读话题';
  const compact = source.replace(/\s+/g, ' ').trim();
  return compact.length > 20 ? `${compact.slice(0, 20)}…` : compact;
}

export function ReaderLayout({
  documentRecord,
  preferences,
  aiSettings,
  dataRevision = 0,
  onBackHome,
  onOpenSettings,
  onSelectChatProfile,
}: ReaderLayoutProps) {
  const [leftOpen, setLeftOpen] = useState(true);
  const [leftTab, setLeftTab] = useState<LeftSidebarTab>('toc');
  const [rightOpen, setRightOpen] = useState(false);

  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [docxHtml, setDocxHtml] = useState<string>('');
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [epubHtml, setEpubHtml] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(documentRecord.format !== 'pdf');

  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [flashcards, setFlashcards] = useState<FlashcardItem[]>([]);

  const [progress, setProgress] = useState(documentRecord.progress);
  const [currentPage, setCurrentPage] = useState(documentRecord.currentPage ?? 1);
  const [totalPages, setTotalPages] = useState(documentRecord.totalPages ?? 0);
  const [isScrolled, setIsScrolled] = useState(false);

  const [translationSession, setTranslationSession] = useState<TranslationSession | null>(null);

  // 多话题伴读与按需全文导读状态
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isAiStreaming, setIsAiStreaming] = useState(false);
  const [pendingQuote, setPendingQuote] = useState<QuoteContext | null>(null);
  const [linkDocContext, setLinkDocContext] = useState(true);

  const [docGuide, setDocGuide] = useState<DocGuideRecord | null>(null);
  const [isGuideStreaming, setIsGuideStreaming] = useState(false);
  const [guideStreamText, setGuideStreamText] = useState('');
  const [guideError, setGuideError] = useState<string | null>(null);

  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone?: 'normal' | 'error' } | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const readerContentRef = useRef<HTMLDivElement | null>(null);
  const pdfViewerRef = useRef<PdfViewerHandle | null>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const docContextIndexRef = useRef<DocContextIndex | null>(null);

  const chatAbortRef = useRef<AbortController | null>(null);
  const guideAbortRef = useRef<AbortController | null>(null);
  const saveProgressTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const chatMessagesRef = useRef<ChatMessage[]>([]);
  chatMessagesRef.current = chatMessages;
  const activeThreadIdRef = useRef<string | null>(null);
  activeThreadIdRef.current = activeThreadId;
  const threadsRef = useRef<ChatThread[]>([]);
  threadsRef.current = threads;

  const showToast = useCallback((text: string, tone: 'normal' | 'error' = 'normal') => {
    setToast({ text, tone });
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const tocText = useMemo(() => formatTocOutline(toc), [toc]);

  // 加载笔记、闪卡、多话题线程与缓存导读，并解析 DOCX / Markdown / EPUB 内容
  useEffect(() => {
    let cancelled = false;
    let epubBlobUrls: string[] = [];

    setParseError(null);
    setToc([]);
    setDocxHtml('');
    setMarkdownContent('');
    setEpubHtml('');
    setThreads([]);
    setActiveThreadId(null);
    setChatMessages([]);
    setPendingQuote(null);
    setTranslationSession(null);
    setDocGuide(null);
    setGuideStreamText('');
    setGuideError(null);
    setIsGuideStreaming(false);
    setIsAiStreaming(false);
    docContextIndexRef.current = null;
    pdfDocRef.current = null;

    Promise.all([
      getNotesByDoc(documentRecord.id),
      getFlashcardsByDoc(documentRecord.id),
      getChatThreadsByDoc(documentRecord.id),
      getDocGuide(documentRecord.id),
    ]).then(([loadedNotes, loadedCards, loadedThreads, loadedGuide]) => {
      if (cancelled) return;
      setNotes(loadedNotes);
      setFlashcards(loadedCards);
      setThreads(loadedThreads);
      if (loadedThreads.length > 0) {
        setActiveThreadId(loadedThreads[0].id);
        setChatMessages(loadedThreads[0].messages);
      }
      if (loadedGuide) {
        setDocGuide(loadedGuide);
      }
    });

    if (documentRecord.format === 'docx') {
      setIsParsing(true);
      parseDocxArrayBuffer(documentRecord.fileData)
        .then(({ html, toc: extractedToc, plainText }) => {
          if (!cancelled) {
            setDocxHtml(html);
            setToc(extractedToc);
            docContextIndexRef.current = buildDocxContextIndex(documentRecord.id, html);
            if (!documentRecord.wordCount && plainText) {
              const stats = computeReadingStats(plainText);
              void updateDocumentProgress(documentRecord.id, stats);
            }
            setIsParsing(false);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setParseError(err instanceof Error ? err.message : 'DOCX 文档解析失败');
            setIsParsing(false);
          }
        });
    } else if (documentRecord.format === 'md') {
      setIsParsing(true);
      try {
        const { content, toc: extractedToc } = parseMarkdownArrayBuffer(documentRecord.fileData);
        setMarkdownContent(content);
        setToc(extractedToc);
        docContextIndexRef.current = buildMarkdownContextIndex(documentRecord.id, content);
        if (!documentRecord.wordCount && content) {
          const stats = computeReadingStats(content);
          void updateDocumentProgress(documentRecord.id, stats);
        }
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Markdown 文档解码失败');
      } finally {
        setIsParsing(false);
      }
    } else if (documentRecord.format === 'epub') {
      setIsParsing(true);
      parseEpubArrayBuffer(documentRecord.fileData)
        .then((parsed) => {
          if (cancelled) {
            parsed.blobUrls.forEach((url) => URL.revokeObjectURL(url));
            return;
          }
          epubBlobUrls = parsed.blobUrls;
          setEpubHtml(parsed.html);
          setToc(parsed.toc);
          docContextIndexRef.current = buildStructuredTextContextIndex(
            documentRecord.id,
            parsed.chapterSections,
          );
          if (!documentRecord.wordCount && parsed.plainText) {
            const stats = computeReadingStats(parsed.plainText);
            void updateDocumentProgress(documentRecord.id, stats);
          }
          setIsParsing(false);
        })
        .catch((err) => {
          if (!cancelled) {
            setParseError(err instanceof Error ? err.message : 'EPUB 电子书解析失败');
            setIsParsing(false);
          }
        });
    } else {
      setIsParsing(false);
    }

    return () => {
      cancelled = true;
      epubBlobUrls.forEach((url) => URL.revokeObjectURL(url));
      chatAbortRef.current?.abort();
      guideAbortRef.current?.abort();
      if (saveProgressTimerRef.current !== null) {
        window.clearTimeout(saveProgressTimerRef.current);
      }
    };
  }, [documentRecord.id, documentRecord.format, documentRecord.fileData, documentRecord.wordCount]);

  // 备份恢复完成后同步刷新当前文档的笔记、闪卡、话题与导读
  useEffect(() => {
    if (dataRevision === 0) return;
    let cancelled = false;
    Promise.all([
      getNotesByDoc(documentRecord.id),
      getFlashcardsByDoc(documentRecord.id),
      getChatThreadsByDoc(documentRecord.id),
      getDocGuide(documentRecord.id),
    ]).then(([loadedNotes, loadedCards, loadedThreads, loadedGuide]) => {
      if (cancelled) return;
      setNotes(loadedNotes);
      setFlashcards(loadedCards);
      setThreads(loadedThreads);
      if (loadedThreads.length > 0) {
        const currentStillExists = activeThreadIdRef.current
          ? loadedThreads.find((t) => t.id === activeThreadIdRef.current)
          : undefined;
        const target = currentStillExists ?? loadedThreads[0];
        setActiveThreadId(target.id);
        setChatMessages(target.messages);
      }
      if (loadedGuide) {
        setDocGuide(loadedGuide);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dataRevision, documentRecord.id]);

  // 初次打开非 PDF 文档时恢复滚动进度
  const restoredScrollRef = useRef<string | null>(null);
  useEffect(() => {
    if (documentRecord.format === 'pdf' || isParsing) return;
    if (restoredScrollRef.current === documentRecord.id) return;
    restoredScrollRef.current = documentRecord.id;

    if (documentRecord.scrollTop > 0) {
      window.setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = documentRecord.scrollTop;
        }
      }, 60);
    }
  }, [documentRecord.id, documentRecord.format, documentRecord.scrollTop, isParsing]);

  // 划词监听
  const { selectionInfo, clearSelection } = useTextSelection({
    containerRef: readerContentRef,
    format: documentRecord.format,
    enabled: !isParsing && !parseError,
  });

  // 滚动时同步顶部淡化状态并防抖写入 IndexedDB 阅读进度
  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const top = el.scrollTop;
    setIsScrolled(top > 36);

    const maxScroll = el.scrollHeight - el.clientHeight;
    const computedProgress =
      documentRecord.format === 'pdf' && totalPages > 0
        ? Math.min(100, Math.round((currentPage / totalPages) * 100))
        : maxScroll > 0
          ? Math.min(100, Math.round((top / maxScroll) * 100))
          : 0;

    setProgress(computedProgress);

    if (saveProgressTimerRef.current !== null) {
      window.clearTimeout(saveProgressTimerRef.current);
    }
    saveProgressTimerRef.current = window.setTimeout(() => {
      updateDocumentProgress(documentRecord.id, {
        progress: computedProgress,
        scrollTop: top,
        currentPage: documentRecord.format === 'pdf' ? currentPage : undefined,
        totalPages: documentRecord.format === 'pdf' ? totalPages : undefined,
        lastOpenedAt: Date.now(),
      }).catch(() => {});
    }, 450);
  };

  const handleCurrentPageChange = useCallback(
    (pageNum: number) => {
      setCurrentPage(pageNum);
      if (totalPages > 0) {
        const nextProgress = Math.min(100, Math.round((pageNum / totalPages) * 100));
        setProgress(nextProgress);
        updateDocumentProgress(documentRecord.id, {
          progress: nextProgress,
          currentPage: pageNum,
          totalPages,
          lastOpenedAt: Date.now(),
        }).catch(() => {});
      }
    },
    [documentRecord.id, totalPages],
  );

  const ensureContextIndex = useCallback(async (): Promise<DocContextIndex | null> => {
    if (docContextIndexRef.current) {
      return docContextIndexRef.current;
    }
    if (documentRecord.format === 'pdf' && pdfDocRef.current) {
      const built = await getOrBuildPdfContextIndex(documentRecord.id, pdfDocRef.current);
      docContextIndexRef.current = built;
      return built;
    }
    return null;
  }, [documentRecord.format, documentRecord.id]);

  const persistThreadSnapshot = useCallback(
    async (threadMeta: Pick<ChatThread, 'id' | 'title' | 'createdAt'>, nextMessages: ChatMessage[]) => {
      const updatedThread: ChatThread = {
        id: threadMeta.id,
        docId: documentRecord.id,
        title: threadMeta.title,
        messages: nextMessages.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
        createdAt: threadMeta.createdAt,
        updatedAt: Date.now(),
      };
      setThreads((prev) => {
        const filtered = prev.filter((t) => t.id !== updatedThread.id);
        return [updatedThread, ...filtered];
      });
      await saveChatThread(updatedThread).catch(() => {});
    },
    [documentRecord.id],
  );

  // 发送右侧 AI 伴读消息（显示全量、发送仅近 5 轮滑动窗口 + 可选 5,000 字封顶正文检索）
  const sendAiChatMessage = useCallback(
    async (userText: string, quoteCtx?: QuoteContext | null, customApiPrompt?: string) => {
      chatAbortRef.current?.abort();

      const now = Date.now();
      const existingThread = activeThreadIdRef.current
        ? threadsRef.current.find((t) => t.id === activeThreadIdRef.current)
        : undefined;

      const threadMeta = existingThread
        ? { id: existingThread.id, title: existingThread.title, createdAt: existingThread.createdAt }
        : {
            id: createId('thread'),
            title: deriveThreadTitle(userText, quoteCtx),
            createdAt: now,
          };

      if (!existingThread) {
        setActiveThreadId(threadMeta.id);
        activeThreadIdRef.current = threadMeta.id;
      }

      const userMessage: ChatMessage = {
        id: createId('msg-u'),
        role: 'user',
        content: userText,
        quoteContext: quoteCtx ?? undefined,
        createdAt: now,
      };
      const assistantMsgId = createId('msg-a');
      const assistantPlaceholder: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        createdAt: now,
        isStreaming: true,
      };

      const previousMessages = chatMessagesRef.current;
      const initialThreadMessages = [...previousMessages, userMessage, assistantPlaceholder];
      setChatMessages(initialThreadMessages);
      chatMessagesRef.current = initialThreadMessages;
      setPendingQuote(null);
      setIsAiStreaming(true);

      // 立即落库用户提问，确保即使刷新也不会丢失提问
      void persistThreadSnapshot(threadMeta, [...previousMessages, userMessage]);

      // 发送层：严格近 5 轮（最多 10 条）滑动窗口
      const historyForApi = buildSlidingWindowHistory(previousMessages, 5);

      let retrievedContextText = '';
      if (linkDocContext && !customApiPrompt) {
        try {
          const index = await ensureContextIndex();
          if (index) {
            const retrievalQuery = [userText, quoteCtx?.quote ?? ''].filter(Boolean).join(' ');
            const result = retrieveContextForQuery(index, {
              query: retrievalQuery,
              progressRatio: progress / 100,
              currentPage: documentRecord.format === 'pdf' ? currentPage : undefined,
              maxChars: 5000,
            });
            retrievedContextText = result.contextText;
          }
        } catch {
          retrievedContextText = '';
        }
      }

      const currentUserPayload =
        customApiPrompt ??
        [
          retrievedContextText
            ? `【文档正文参考（当前阅读位置 + 本地相关性检索，严格节选）】\n${retrievedContextText}`
            : '',
          quoteCtx?.context ? `【划词所在上下文】\n${quoteCtx.context}` : '',
          quoteCtx?.quote ? `【划词引用原文】\n${quoteCtx.quote}` : '',
          quoteCtx?.translation ? `【参考译文】\n${quoteCtx.translation}` : '',
          `【用户提问】\n${userText}`,
        ]
          .filter(Boolean)
          .join('\n\n');

      historyForApi.push({ role: 'user', content: currentUserPayload });

      const controller = new AbortController();
      chatAbortRef.current = controller;

      const systemPrompt = buildChatSystemPrompt({
        docTitle: documentRecord.title,
        tocText,
        guideSummary: docGuide?.summary,
      });

      streamCompletion({
        settings: aiSettings,
        scene: 'chat',
        systemPrompt,
        messages: historyForApi,
        signal: controller.signal,
        onChunk: (_delta, fullText) => {
          setChatMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, content: fullText } : m)),
          );
        },
        onDone: (fullText) => {
          setIsAiStreaming(false);
          const finalMessages = chatMessagesRef.current.map((m) =>
            m.id === assistantMsgId ? { ...m, content: fullText, isStreaming: false } : m,
          );
          setChatMessages(finalMessages);
          void persistThreadSnapshot(threadMeta, finalMessages);
        },
        onError: (err) => {
          setIsAiStreaming(false);
          const finalMessages = chatMessagesRef.current.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: err.message, isStreaming: false, isError: true }
              : m,
          );
          setChatMessages(finalMessages);
          void persistThreadSnapshot(threadMeta, finalMessages);
        },
      }).catch((err) => {
        if (isAbortError(err, controller.signal)) {
          setIsAiStreaming(false);
          const settled = chatMessagesRef.current
            .map((m) => (m.id === assistantMsgId ? { ...m, isStreaming: false } : m))
            .filter((m) => !(m.id === assistantMsgId && !m.content.trim()));
          setChatMessages(settled);
          void persistThreadSnapshot(threadMeta, settled);
        }
      });
    },
    [
      aiSettings,
      currentPage,
      docGuide?.summary,
      documentRecord.format,
      documentRecord.title,
      ensureContextIndex,
      linkDocContext,
      persistThreadSnapshot,
      progress,
      tocText,
    ],
  );

  // 按需生成全文结构导读（绝不自动触发）
  const handleGenerateDocGuide = useCallback(async () => {
    if (!isAiConfigured(aiSettings, 'chat')) {
      showToast('请先配置 AI 模型 API Key', 'error');
      onOpenSettings('ai');
      return;
    }

    guideAbortRef.current?.abort();
    setGuideError(null);
    setGuideStreamText('');
    setIsGuideStreaming(true);

    try {
      const index = await ensureContextIndex();
      if (!index || index.chunks.length === 0) {
        setIsGuideStreaming(false);
        setGuideError('当前文档暂无可提取的正文文本，无法生成导读。');
        return;
      }

      const sampledText = sampleDocumentForGuide(index, tocText);
      const { systemPrompt, messages } = buildDocGuidePrompt(documentRecord.title, sampledText);

      const controller = new AbortController();
      guideAbortRef.current = controller;

      await streamCompletion({
        settings: aiSettings,
        scene: 'chat',
        systemPrompt,
        messages,
        temperature: 0.3,
        signal: controller.signal,
        onChunk: (_delta, fullText) => {
          setGuideStreamText(fullText);
        },
        onDone: async (fullText) => {
          setIsGuideStreaming(false);
          if (fullText.trim()) {
            const record: DocGuideRecord = {
              docId: documentRecord.id,
              summary: fullText.trim(),
              generatedAt: Date.now(),
            };
            setDocGuide(record);
            await saveDocGuide(record);
            showToast('全文结构导读已生成并缓存');
          }
        },
        onError: (err) => {
          setIsGuideStreaming(false);
          setGuideError(err.message);
        },
      });
    } catch (err) {
      if (isAbortError(err, guideAbortRef.current?.signal)) {
        setIsGuideStreaming(false);
        return;
      }
      setIsGuideStreaming(false);
      setGuideError(err instanceof Error ? err.message : '生成导读失败，请重试');
    }
  }, [aiSettings, documentRecord.id, documentRecord.title, ensureContextIndex, onOpenSettings, showToast, tocText]);

  // 话题切换 / 新建 / 删除
  const handleCreateNewThread = useCallback(() => {
    chatAbortRef.current?.abort();
    setIsAiStreaming(false);
    setActiveThreadId(null);
    setChatMessages([]);
    setPendingQuote(null);
  }, []);

  const handleSelectThread = useCallback((threadId: string) => {
    if (threadId === activeThreadIdRef.current) return;
    chatAbortRef.current?.abort();
    setIsAiStreaming(false);
    const target = threadsRef.current.find((t) => t.id === threadId);
    if (!target) return;
    setActiveThreadId(target.id);
    setChatMessages(target.messages);
    setPendingQuote(null);
  }, []);

  const handleDeleteThread = useCallback(async (threadId: string) => {
    if (threadId === activeThreadIdRef.current) {
      chatAbortRef.current?.abort();
      setIsAiStreaming(false);
    }
    await deleteChatThread(threadId);
    const remaining = threadsRef.current.filter((t) => t.id !== threadId);
    setThreads(remaining);

    if (threadId === activeThreadIdRef.current) {
      if (remaining.length > 0) {
        setActiveThreadId(remaining[0].id);
        setChatMessages(remaining[0].messages);
      } else {
        setActiveThreadId(null);
        setChatMessages([]);
      }
    }
  }, []);

  // 划词动作 1：【译成中文】—— 仅在原位展开悬浮译文/词典卡，绝不强行打开右侧栏
  const handleToolbarTranslate = () => {
    if (!selectionInfo) return;
    setTranslationSession({
      id: createId('tr'),
      quote: selectionInfo.text,
      rawQuote: selectionInfo.rawText,
      context: selectionInfo.context,
      position: selectionInfo.popoverPosition,
      anchor: selectionInfo.anchor,
    });
    clearSelection();
  };

  // 划词动作 2：【通俗解释】—— 自动展开右侧 AI 面板流式解读
  const handleToolbarExplain = () => {
    if (!selectionInfo) return;
    const { userDisplayLabel, userPrompt } = buildExplainPrompt(
      selectionInfo.text,
      selectionInfo.context,
    );
    const quoteCtx: QuoteContext = {
      quote: selectionInfo.text,
      context: selectionInfo.context,
      actionLabel: userDisplayLabel,
    };
    setTranslationSession(null);
    setRightOpen(true);
    clearSelection();
    window.getSelection()?.removeAllRanges();
    void sendAiChatMessage('请用通俗易懂的方式帮我解释这段内容。', quoteCtx, userPrompt);
  };

  // 划词动作 3：【总结】—— 自动展开右侧 AI 面板流式总结
  const handleToolbarSummarize = () => {
    if (!selectionInfo) return;
    const { userDisplayLabel, userPrompt } = buildSummarizePrompt(
      selectionInfo.text,
      selectionInfo.context,
    );
    const quoteCtx: QuoteContext = {
      quote: selectionInfo.text,
      context: selectionInfo.context,
      actionLabel: userDisplayLabel,
    };
    setTranslationSession(null);
    setRightOpen(true);
    clearSelection();
    window.getSelection()?.removeAllRanges();
    void sendAiChatMessage('请总结这段内容的核心观点。', quoteCtx, userPrompt);
  };

  // 划词动作 4：【加入高亮】支持 3 色纸感高亮
  const handleToolbarHighlight = async (color: HighlightColor = 'amber') => {
    if (!selectionInfo) return;
    const newNote: NoteItem = {
      id: createId('note'),
      docId: documentRecord.id,
      type: 'highlight',
      quote: selectionInfo.text,
      rawQuote: selectionInfo.rawText,
      context: selectionInfo.context,
      color,
      anchor: selectionInfo.anchor,
      createdAt: Date.now(),
    };
    await addNote(newNote);
    setNotes((prev) => [newNote, ...prev]);
    clearSelection();
    window.getSelection()?.removeAllRanges();
    showToast('已加入高亮笔记');
  };

  // 划词动作 5：【生成闪卡】
  const handleToolbarFlashcard = async () => {
    if (!selectionInfo) return;
    const quote = selectionInfo.text;
    const context = selectionInfo.context;
    clearSelection();
    window.getSelection()?.removeAllRanges();

    if (!isAiConfigured(aiSettings, 'chat')) {
      showToast('请先配置 AI 模型 API Key', 'error');
      onOpenSettings('ai');
      return;
    }

    showToast('正在凝练主动回忆闪卡...');
    const { systemPrompt, messages } = buildFlashcardPrompt(quote, context);

    try {
      const raw = await streamCompletion({
        settings: aiSettings,
        scene: 'chat',
        systemPrompt,
        messages,
        temperature: 0.3,
        onChunk: () => {},
      });
      const drafts = parseFlashcardsJson(raw);
      const createdAt = Date.now();
      const newCards: FlashcardItem[] = drafts.map((d, idx) => ({
        id: createId(`card-${idx}`),
        docId: documentRecord.id,
        question: d.question,
        answer: d.answer,
        sourceQuote: quote,
        createdAt: createdAt + idx,
      }));
      await addFlashcards(newCards);
      setFlashcards((prev) => [...newCards, ...prev]);
      setLeftOpen(true);
      setLeftTab('flashcards');
      showToast(`已生成 ${newCards.length} 张闪卡并存入左侧栏`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '生成闪卡失败', 'error');
    }
  };

  // 原位译文卡动作：保存双语笔记
  const handleSaveTranslationNote = async (payload: {
    quote: string;
    rawQuote: string;
    translation: string;
    context: string;
    anchor: NoteAnchor;
  }) => {
    const newNote: NoteItem = {
      id: createId('note'),
      docId: documentRecord.id,
      type: 'translation',
      quote: payload.quote,
      rawQuote: payload.rawQuote,
      translation: payload.translation,
      context: payload.context,
      color: 'amber',
      anchor: payload.anchor,
      createdAt: Date.now(),
    };
    await addNote(newNote);
    setNotes((prev) => [newNote, ...prev]);
    showToast('双语译文已保存至笔记');
  };

  // 原位译文卡动作：发送到右侧追问
  const handleSendTranslationToFollowUp = (payload: {
    quote: string;
    translation: string;
    context: string;
  }) => {
    setPendingQuote({
      quote: payload.quote,
      translation: payload.translation,
      context: payload.context,
      actionLabel: '长难句追问',
    });
    setRightOpen(true);
  };

  // 点击目录跳转
  const handleSelectTocItem = (item: TocItem) => {
    setActiveHeadingId(item.id);
    if (documentRecord.format === 'pdf' && item.pageNumber) {
      pdfViewerRef.current?.scrollToPage(item.pageNumber);
      return;
    }
    const container = readerContentRef.current;
    if (!container) return;
    const el = document.getElementById(item.id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // 点击左侧笔记跳转原文位置
  const handleSelectNote = (note: NoteItem) => {
    if (documentRecord.format === 'pdf' && note.anchor.pageNumber) {
      pdfViewerRef.current?.scrollToPage(note.anchor.pageNumber);
      return;
    }
    const container = readerContentRef.current;
    if (container) {
      const ok = scrollToDomHighlight(container, note.id);
      if (!ok) {
        showToast('未在当前视图定位到高亮片段');
      }
    }
  };

  const handleClickInlineNote = (noteId: string) => {
    setLeftOpen(true);
    setLeftTab('notes');
    if (readerContentRef.current) {
      scrollToDomHighlight(readerContentRef.current, noteId);
    }
  };

  const handleUpdateNoteAnnotation = async (noteId: string, rawAnnotation: string) => {
    const annotation = rawAnnotation.trim() || undefined;
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, annotation } : n)),
    );
    await updateNote(noteId, { annotation });
    showToast(annotation ? '批注已保存' : '批注已移除');
  };

  const handleUpdateNoteColor = async (noteId: string, color: HighlightColor) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, color } : n)),
    );
    await updateNote(noteId, { color });
  };

  const hasAiKey = isAiConfigured(aiSettings);

  return (
    <div className="relative flex h-screen w-screen overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
      {/* 无干扰顶部 1.5px 微细阅读进度线 */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 right-0 top-0 z-50 h-[1.5px] bg-transparent"
      >
        <div
          className="h-full transition-[width] duration-200 ease-out"
          style={{
            width: `${Math.min(100, Math.max(0, progress))}%`,
            backgroundColor: 'var(--primary)',
            opacity: 0.72,
          }}
        />
      </div>

      {/* 顶部极简悬浮条 */}
      <TopBar
        title={documentRecord.title}
        format={documentRecord.format}
        progress={progress}
        currentPage={currentPage}
        totalPages={totalPages}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        isScrolled={isScrolled}
        hasAiKey={hasAiKey}
        onBackHome={onBackHome}
        onToggleLeft={() => setLeftOpen((v) => !v)}
        onToggleRight={() => setRightOpen((v) => !v)}
        onOpenSettings={() => onOpenSettings('appearance')}
      />

      {/* 左侧栏：目录 / 笔记 / 闪卡 */}
      <LeftSidebar
        docId={documentRecord.id}
        isOpen={leftOpen}
        activeTab={leftTab}
        onTabChange={setLeftTab}
        format={documentRecord.format}
        toc={toc}
        activeHeadingId={activeHeadingId}
        totalPages={totalPages}
        notes={notes}
        flashcards={flashcards}
        onSelectTocItem={handleSelectTocItem}
        onJumpToPage={(pageNum) => pdfViewerRef.current?.scrollToPage(pageNum)}
        onSelectNote={handleSelectNote}
        onUpdateNoteAnnotation={handleUpdateNoteAnnotation}
        onUpdateNoteColor={handleUpdateNoteColor}
        onDeleteNote={async (noteId) => {
          await deleteNote(noteId);
          setNotes((prev) => prev.filter((n) => n.id !== noteId));
        }}
        onDeleteFlashcard={async (cardId) => {
          await deleteFlashcard(cardId);
          setFlashcards((prev) => prev.filter((c) => c.id !== cardId));
        }}
        onOpenExport={() => setExportOpen(true)}
      />

      {/* 中间主阅读区 */}
      <main
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="lumina-scroll relative flex-1 overflow-y-auto pt-12"
        style={{ backgroundColor: 'var(--surface)' }}
      >
        <div ref={readerContentRef} className="min-h-full">
          {parseError ? (
            <div
              className="mx-auto my-20 max-w-md rounded-2xl border p-8 text-center"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-subtle)' }}
            >
              <p className="text-sm font-medium" style={{ color: 'var(--error)' }}>
                文档解析失败
              </p>
              <p className="mt-2 text-xs" style={{ color: 'var(--on-surface-muted)' }}>
                {parseError}
              </p>
            </div>
          ) : isParsing ? (
            <div className="flex flex-col items-center justify-center py-28">
              <div
                className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }}
              />
              <p className="mt-3 text-sm" style={{ color: 'var(--on-surface-muted)' }}>
                正在排版文档内容...
              </p>
            </div>
          ) : documentRecord.format === 'pdf' ? (
            <PdfViewer
              ref={pdfViewerRef}
              fileData={documentRecord.fileData}
              maxWidth={preferences.maxWidth}
              pdfZoom={preferences.pdfZoom}
              notes={notes}
              onTocReady={setToc}
              onPdfDocumentReady={(doc) => {
                pdfDocRef.current = doc;
                if (doc && !documentRecord.wordCount) {
                  window.setTimeout(() => {
                    if (pdfDocRef.current !== doc) return;
                    void getOrBuildPdfContextIndex(documentRecord.id, doc)
                      .then((idx) => {
                        docContextIndexRef.current = idx;
                        const joined = idx.chunks.map((c) => c.text).join('\n');
                        const stats = computeReadingStats(joined);
                        if (stats.wordCount > 0) {
                          void updateDocumentProgress(documentRecord.id, stats);
                        }
                      })
                      .catch(() => {});
                  }, 600);
                }
              }}
              onTotalPagesReady={setTotalPages}
              onCurrentPageChange={handleCurrentPageChange}
              onNoteClick={handleClickInlineNote}
              initialPage={documentRecord.currentPage}
            />
          ) : documentRecord.format === 'docx' ? (
            <DocxViewer
              html={docxHtml}
              maxWidth={preferences.maxWidth}
              toc={toc}
              notes={notes}
              onActiveHeadingChange={setActiveHeadingId}
              onNoteClick={handleClickInlineNote}
            />
          ) : documentRecord.format === 'epub' ? (
            <EpubViewer
              html={epubHtml}
              maxWidth={preferences.maxWidth}
              toc={toc}
              notes={notes}
              onActiveHeadingChange={setActiveHeadingId}
              onNoteClick={handleClickInlineNote}
            />
          ) : (
            <MarkdownViewer
              content={markdownContent}
              maxWidth={preferences.maxWidth}
              toc={toc}
              notes={notes}
              onActiveHeadingChange={setActiveHeadingId}
              onNoteClick={handleClickInlineNote}
            />
          )}
        </div>
      </main>

      {/* 右侧栏：AI 伴读助手 */}
      <RightAiSidebar
        isOpen={rightOpen}
        threads={threads}
        activeThreadId={activeThreadId}
        messages={chatMessages}
        isStreaming={isAiStreaming}
        pendingQuote={pendingQuote}
        linkDocContext={linkDocContext}
        docGuide={docGuide}
        isGuideStreaming={isGuideStreaming}
        guideStreamText={guideStreamText}
        guideError={guideError}
        aiSettings={aiSettings}
        onClose={() => setRightOpen(false)}
        onCreateNewThread={handleCreateNewThread}
        onSelectThread={handleSelectThread}
        onDeleteThread={handleDeleteThread}
        onToggleLinkDocContext={setLinkDocContext}
        onGenerateGuide={handleGenerateDocGuide}
        onStopGuide={() => {
          guideAbortRef.current?.abort();
          setIsGuideStreaming(false);
        }}
        onSendMessage={(txt, ctx) => void sendAiChatMessage(txt, ctx)}
        onStopStreaming={() => {
          chatAbortRef.current?.abort();
          setIsAiStreaming(false);
        }}
        onClearPendingQuote={() => setPendingQuote(null)}
        onOpenSettings={() => onOpenSettings('ai')}
        onSelectChatProfile={onSelectChatProfile}
      />

      {/* 划词悬浮工具条 */}
      {selectionInfo && (
        <SelectionToolbar
          position={selectionInfo.toolbarPosition}
          onTranslate={handleToolbarTranslate}
          onExplain={handleToolbarExplain}
          onSummarize={handleToolbarSummarize}
          onHighlight={handleToolbarHighlight}
          onGenerateFlashcard={handleToolbarFlashcard}
        />
      )}

      {/* 原位悬浮中文译文/词典卡片 */}
      {translationSession && (
        <TranslationPopover
          session={translationSession}
          aiSettings={aiSettings}
          onClose={() => setTranslationSession(null)}
          onOpenSettings={() => onOpenSettings('ai')}
          onSaveToNotes={handleSaveTranslationNote}
          onSendToFollowUp={handleSendTranslationToFollowUp}
        />
      )}

      {/* 导出笔记弹窗 */}
      <ExportModal
        isOpen={exportOpen}
        docTitle={documentRecord.title}
        fileName={documentRecord.fileName}
        notes={notes}
        flashcards={flashcards}
        onClose={() => setExportOpen(false)}
      />

      {/* 轻量 Toast 反馈 */}
      {toast && (
        <div
          data-floating-ui="true"
          className="lumina-animate-pop pointer-events-none fixed bottom-6 left-1/2 z-[90] -translate-x-1/2 rounded-full border px-4 py-2 text-xs font-medium backdrop-blur-xl"
          style={{
            backgroundColor: 'var(--surface-glass)',
            borderColor: toast.tone === 'error' ? 'var(--error)' : 'var(--border)',
            color: toast.tone === 'error' ? 'var(--error)' : 'var(--on-surface)',
            boxShadow: 'var(--shadow-floating)',
          }}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
