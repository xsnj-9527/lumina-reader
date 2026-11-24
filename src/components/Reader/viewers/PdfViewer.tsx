import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import type { NoteItem, TocItem } from '../../../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PdfViewerHandle {
  scrollToPage: (pageNumber: number) => void;
}

interface PdfViewerProps {
  fileData: ArrayBuffer;
  maxWidth: number;
  pdfZoom: number;
  notes: NoteItem[];
  onTocReady: (toc: TocItem[]) => void;
  onPdfDocumentReady?: (doc: PDFDocumentProxy | null) => void;
  onTotalPagesReady?: (totalPages: number) => void;
  onCurrentPageChange?: (pageNumber: number) => void;
  onNoteClick?: (noteId: string) => void;
  initialPage?: number;
}

interface PdfPageItemProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  targetWidth: number;
  defaultAspectRatio: number;
  notes: NoteItem[];
  onNoteClick?: (noteId: string) => void;
  registerPageEl: (pageNumber: number, el: HTMLDivElement | null) => void;
}

async function resolveOutlineItems(
  pdfDoc: PDFDocumentProxy,
  items: Awaited<ReturnType<PDFDocumentProxy['getOutline']>>,
  level = 1,
  prefix = 'pdf-toc',
): Promise<TocItem[]> {
  if (!items || items.length === 0) return [];
  const result: TocItem[] = [];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    let pageNumber: number | undefined;

    try {
      let destArray: unknown[] | null = null;
      if (typeof item.dest === 'string') {
        destArray = (await pdfDoc.getDestination(item.dest)) as unknown[] | null;
      } else if (Array.isArray(item.dest)) {
        destArray = item.dest;
      }
      if (destArray && destArray[0]) {
        const pageIndex = await pdfDoc.getPageIndex(destArray[0] as Parameters<PDFDocumentProxy['getPageIndex']>[0]);
        pageNumber = pageIndex + 1;
      }
    } catch {
      pageNumber = undefined;
    }

    const id = `${prefix}-${level}-${i}`;
    const children =
      item.items && item.items.length > 0
        ? await resolveOutlineItems(pdfDoc, item.items, Math.min(level + 1, 4), id)
        : undefined;

    result.push({
      id,
      title: item.title?.trim() || `第 ${pageNumber ?? '?'} 页`,
      level,
      pageNumber,
      children,
    });
  }

  return result;
}

function PdfPageItem({
  pdfDoc,
  pageNumber,
  targetWidth,
  defaultAspectRatio,
  notes,
  onNoteClick,
  registerPageEl,
}: PdfPageItemProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);

  const [isVisible, setIsVisible] = useState(pageNumber <= 3);
  const [pageSize, setPageSize] = useState<{ width: number; height: number }>({
    width: targetWidth,
    height: Math.round(targetWidth * defaultAspectRatio),
  });
  const [scaleFactor, setScaleFactor] = useState(1);

  useEffect(() => {
    registerPageEl(pageNumber, containerRef.current);
    return () => registerPageEl(pageNumber, null);
  }, [pageNumber, registerPageEl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsVisible(true);
          }
        }
      },
      { rootMargin: '900px 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    let cancelled = false;
    let renderTask: RenderTask | null = null;
    let textLayerInstance: pdfjsLib.TextLayer | null = null;

    async function renderPage() {
      let page: PDFPageProxy;
      try {
        page = await pdfDoc.getPage(pageNumber);
      } catch {
        return;
      }
      if (cancelled) return;

      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.max(0.25, targetWidth / baseViewport.width);
      const viewport = page.getViewport({ scale });

      if (cancelled) return;
      const cssWidth = Math.floor(viewport.width);
      const cssHeight = Math.floor(viewport.height);
      setPageSize({ width: cssWidth, height: cssHeight });
      setScaleFactor(viewport.scale);

      const canvas = canvasRef.current;
      const textLayerDiv = textLayerRef.current;
      if (!canvas || !textLayerDiv) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      renderTask = page.render({
        canvasContext: ctx,
        viewport,
      });

      try {
        await renderTask.promise;
      } catch (err) {
        if (err instanceof Error && err.name === 'RenderingCancelledException') {
          return;
        }
      }

      if (cancelled) return;

      // 每次重绘前清空旧文本节点并注入精准对齐的 TextLayer
      textLayerDiv.innerHTML = '';
      textLayerInstance = new pdfjsLib.TextLayer({
        textContentSource: page.streamTextContent(),
        container: textLayerDiv,
        viewport,
      });

      try {
        await textLayerInstance.render();
      } catch {
        // 取消或页面销毁时静默退出
      }
    }

    renderPage();

    return () => {
      cancelled = true;
      try {
        renderTask?.cancel();
      } catch {
        // 忽略已结束任务取消异常
      }
      try {
        textLayerInstance?.cancel();
      } catch {
        // 忽略取消异常
      }
    };
  }, [isVisible, pdfDoc, pageNumber, targetWidth]);

  const pageNotes = notes.filter(
    (n) => n.anchor.pageNumber === pageNumber && n.anchor.pdfRects && n.anchor.pdfRects.length > 0,
  );

  const pageStyle: CSSProperties & { '--scale-factor'?: string } = {
    width: `${pageSize.width}px`,
    height: `${pageSize.height}px`,
    '--scale-factor': String(scaleFactor),
  };

  return (
    <div
      ref={containerRef}
      data-page-number={pageNumber}
      className="lumina-pdf-page mx-auto my-6 select-text"
      style={pageStyle}
    >
      <canvas ref={canvasRef} className="pointer-events-none block" />

      {/* 持久化划词高亮层，置于 Canvas 上方、TextLayer 下方 */}
      {pageNotes.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[1]">
          {pageNotes.map((note) => {
            const noteColor = note.color || 'amber';
            return note.anchor.pdfRects?.map((rect, idx) => (
              <div
                key={`${note.id}-${idx}`}
                data-note-color={noteColor}
                onClick={(e) => {
                  e.stopPropagation();
                  onNoteClick?.(note.id);
                }}
                style={{
                  left: `${rect.left * 100}%`,
                  top: `${rect.top * 100}%`,
                  width: `${rect.width * 100}%`,
                  height: `${rect.height * 100}%`,
                  backgroundColor: `var(--highlight-${noteColor})`,
                  borderBottom: `1.5px solid var(--highlight-${noteColor}-border)`,
                }}
                className="absolute rounded-[2px]"
              />
            ));
          })}
        </div>
      )}

      <div ref={textLayerRef} className="textLayer" />

      <div
        className="pointer-events-none absolute bottom-2 right-3 z-[3] rounded-full px-2 py-0.5 text-[11px] font-medium"
        style={{
          backgroundColor: 'var(--surface-glass)',
          color: 'var(--on-surface-muted)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {pageNumber}
      </div>
    </div>
  );
}

export const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(function PdfViewer(
  {
    fileData,
    maxWidth,
    pdfZoom,
    notes,
    onTocReady,
    onPdfDocumentReady,
    onTotalPagesReady,
    onCurrentPageChange,
    onNoteClick,
    initialPage,
  },
  ref,
) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const onPdfDocumentReadyRef = useRef(onPdfDocumentReady);
  onPdfDocumentReadyRef.current = onPdfDocumentReady;

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [defaultAspectRatio, setDefaultAspectRatio] = useState(1.414);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(900);

  const registerPageEl = useRef((pageNum: number, el: HTMLDivElement | null) => {
    if (el) {
      pageElementsRef.current.set(pageNum, el);
    } else {
      pageElementsRef.current.delete(pageNum);
    }
  }).current;

  useImperativeHandle(
    ref,
    () => ({
      scrollToPage(pageNumber: number) {
        const target = pageElementsRef.current.get(pageNumber);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      },
    }),
    [],
  );

  // 动态响应中间阅读区宽度变化
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 加载 PDF 文档与大纲
  useEffect(() => {
    let destroyed = false;
    setLoadError(null);
    setPdfDoc(null);

    const loadingTask = pdfjsLib.getDocument({
      data: fileData.slice(0),
    });

    loadingTask.promise
      .then(async (doc) => {
        if (destroyed) {
          await doc.destroy();
          return;
        }
        setPdfDoc(doc);
        onPdfDocumentReadyRef.current?.(doc);
        setTotalPages(doc.numPages);
        onTotalPagesReady?.(doc.numPages);

        try {
          const firstPage = await doc.getPage(1);
          const vp = firstPage.getViewport({ scale: 1 });
          if (!destroyed && vp.width > 0) {
            setDefaultAspectRatio(vp.height / vp.width);
          }
        } catch {
          // 默认 A4 比例兜底
        }

        try {
          const outline = await doc.getOutline();
          if (!destroyed) {
            const toc = await resolveOutlineItems(doc, outline);
            onTocReady(toc);
          }
        } catch {
          if (!destroyed) onTocReady([]);
        }
      })
      .catch((err) => {
        if (!destroyed) {
          setLoadError(err instanceof Error ? err.message : 'PDF 文档解析失败，请确认文件未损坏。');
        }
      });

    return () => {
      destroyed = true;
      onPdfDocumentReadyRef.current?.(null);
      loadingTask.destroy().catch(() => {});
    };
  }, [fileData, onTocReady, onTotalPagesReady]);

  // 恢复上次页码（仅在初始打开时）
  const didInitialScrollRef = useRef(false);
  useEffect(() => {
    if (!pdfDoc || didInitialScrollRef.current) return;
    didInitialScrollRef.current = true;
    if (initialPage && initialPage > 1) {
      window.setTimeout(() => {
        pageElementsRef.current.get(initialPage)?.scrollIntoView({ behavior: 'auto', block: 'start' });
      }, 120);
    }
  }, [pdfDoc, initialPage]);

  // 跟踪当前居中的页码
  useEffect(() => {
    if (!pdfDoc || totalPages === 0 || !onCurrentPageChange) return;

    const visibilityMap = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNum = Number((entry.target as HTMLElement).dataset.pageNumber);
          if (pageNum) {
            visibilityMap.set(pageNum, entry.intersectionRatio);
          }
        }
        let bestPage = 1;
        let bestRatio = -1;
        visibilityMap.forEach((ratio, pageNum) => {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestPage = pageNum;
          }
        });
        if (bestRatio > 0) {
          onCurrentPageChange(bestPage);
        }
      },
      { threshold: [0.1, 0.35, 0.6, 0.85] },
    );

    pageElementsRef.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pdfDoc, totalPages, onCurrentPageChange]);

  const targetWidth = Math.max(300, Math.min(maxWidth, containerWidth - 40) * pdfZoom);

  if (loadError) {
    return (
      <div className="mx-auto my-20 max-w-md rounded-2xl border p-8 text-center" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-subtle)' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--error)' }}>
          无法加载 PDF 文件
        </p>
        <p className="mt-2 text-xs" style={{ color: 'var(--on-surface-muted)' }}>
          {loadError}
        </p>
      </div>
    );
  }

  if (!pdfDoc) {
    return (
      <div className="flex flex-col items-center justify-center py-28">
        <div
          className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }}
        />
        <p className="mt-3 text-sm" style={{ color: 'var(--on-surface-muted)' }}>
          正在渲染 PDF 页面与文本层...
        </p>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="w-full pb-28 pt-4">
      {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNum) => (
        <PdfPageItem
          key={pageNum}
          pdfDoc={pdfDoc}
          pageNumber={pageNum}
          targetWidth={targetWidth}
          defaultAspectRatio={defaultAspectRatio}
          notes={notes}
          onNoteClick={onNoteClick}
          registerPageEl={registerPageEl}
        />
      ))}
    </div>
  );
});
