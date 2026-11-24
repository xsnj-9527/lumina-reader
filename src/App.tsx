import { useCallback, useEffect, useState } from 'react';
import type { DocumentRecord, DocumentSummary } from './types';
import {
  deleteDocument,
  getDocumentById,
  listDocumentSummaries,
  saveDocument,
  updateDocumentProgress,
} from './services/db';
import { clearPdfIndexCache } from './utils/docContextIndex';
import {
  computeReadingStats,
  detectDocFormat,
  extractDocumentTitle,
  parseDocxArrayBuffer,
  parseMarkdownArrayBuffer,
} from './services/fileParser';
import { parseEpubArrayBuffer } from './services/epubParser';
import {
  SAMPLE_DOC_FILENAME,
  SAMPLE_DOC_TITLE,
  SAMPLE_MARKDOWN_CONTENT,
} from './constants/sampleDoc';
import { usePreferences } from './hooks/usePreferences';
import { useAiSettings } from './hooks/useAiSettings';
import { HomeView } from './components/Home/HomeView';
import { ReaderLayout } from './components/Reader/ReaderLayout';
import { SettingsModal, type SettingsTab } from './components/Settings/SettingsModal';
import { ErrorBoundary } from './components/Common/ErrorBoundary';

const SAMPLE_DOC_ID = 'lumina-sample-slow-reading';

export function App() {
  const { preferences, updatePreferences } = usePreferences();
  const { aiSettings, updateAiSettings } = useAiSettings();

  const [recentDocs, setRecentDocs] = useState<DocumentSummary[]>([]);
  const [activeDoc, setActiveDoc] = useState<DocumentRecord | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('appearance');
  const [dataRevision, setDataRevision] = useState(0);

  const openSettings = useCallback((tab: SettingsTab = 'appearance') => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }, []);

  const handleSelectChatProfile = useCallback(
    (profileId: string) => {
      updateAiSettings((prev) => ({
        ...prev,
        chatProfileId: profileId,
      }));
    },
    [updateAiSettings],
  );

  const refreshRecentDocs = useCallback(async () => {
    try {
      const list = await listDocumentSummaries();
      setRecentDocs(list);
    } catch {
      setRecentDocs([]);
    }
  }, []);

  useEffect(() => {
    refreshRecentDocs();
  }, [refreshRecentDocs]);

  const handleImportFile = async (file: File) => {
    const format = detectDocFormat(file.name);
    if (!format) return;

    setIsImporting(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const now = Date.now();
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `doc-${crypto.randomUUID()}`
          : `doc-${now}-${Math.random().toString(36).slice(2, 8)}`;

      let title = extractDocumentTitle(file.name);
      let wordCount: number | undefined;
      let estimatedMinutes: number | undefined;

      try {
        if (format === 'md') {
          const { content } = parseMarkdownArrayBuffer(arrayBuffer);
          const stats = computeReadingStats(content);
          wordCount = stats.wordCount;
          estimatedMinutes = stats.estimatedMinutes;
        } else if (format === 'docx') {
          const { plainText } = await parseDocxArrayBuffer(arrayBuffer);
          const stats = computeReadingStats(plainText);
          wordCount = stats.wordCount;
          estimatedMinutes = stats.estimatedMinutes;
        } else if (format === 'epub') {
          const parsed = await parseEpubArrayBuffer(arrayBuffer);
          if (parsed.title) {
            title = parsed.title;
          }
          const stats = computeReadingStats(parsed.plainText);
          wordCount = stats.wordCount;
          estimatedMinutes = stats.estimatedMinutes;
          parsed.blobUrls.forEach((url) => URL.revokeObjectURL(url));
        }
      } catch {
        // 统计失败不阻断导入流程，阅读器渲染时仍会妥善处理或报错提示
      }

      const record: DocumentRecord = {
        id,
        title,
        fileName: file.name,
        format,
        fileSize: file.size,
        fileData: arrayBuffer,
        progress: 0,
        scrollTop: 0,
        currentPage: format === 'pdf' ? 1 : undefined,
        wordCount,
        estimatedMinutes,
        lastOpenedAt: now,
        createdAt: now,
      };

      await saveDocument(record);
      await refreshRecentDocs();
      setActiveDoc(record);
    } finally {
      setIsImporting(false);
    }
  };

  const handleOpenDocument = async (docId: string) => {
    const record = await getDocumentById(docId);
    if (!record) {
      await refreshRecentDocs();
      return;
    }
    const now = Date.now();
    await updateDocumentProgress(docId, { lastOpenedAt: now });
    setActiveDoc({ ...record, lastOpenedAt: now });
  };

  const handleOpenSampleDoc = async () => {
    const existing = await getDocumentById(SAMPLE_DOC_ID);
    const now = Date.now();
    if (existing) {
      await updateDocumentProgress(SAMPLE_DOC_ID, { lastOpenedAt: now });
      setActiveDoc({ ...existing, lastOpenedAt: now });
      return;
    }

    const encoded = new TextEncoder().encode(SAMPLE_MARKDOWN_CONTENT);
    const stats = computeReadingStats(SAMPLE_MARKDOWN_CONTENT);
    const sampleRecord: DocumentRecord = {
      id: SAMPLE_DOC_ID,
      title: SAMPLE_DOC_TITLE,
      fileName: SAMPLE_DOC_FILENAME,
      format: 'md',
      fileSize: encoded.byteLength,
      fileData: encoded.buffer,
      progress: 0,
      scrollTop: 0,
      wordCount: stats.wordCount,
      estimatedMinutes: stats.estimatedMinutes,
      lastOpenedAt: now,
      createdAt: now,
    };

    await saveDocument(sampleRecord);
    await refreshRecentDocs();
    setActiveDoc(sampleRecord);
  };

  const handleDeleteDocument = async (docId: string) => {
    clearPdfIndexCache(docId);
    await deleteDocument(docId);
    await refreshRecentDocs();
  };

  const handleBackHome = async () => {
    setActiveDoc(null);
    await refreshRecentDocs();
  };

  return (
    <>
      {activeDoc ? (
        <ErrorBoundary
          key={activeDoc.id}
          onGoHome={() => {
            void handleBackHome();
          }}
          title="文档渲染遇到异常"
          description="解析或渲染当前文档时发生错误（可能是文件结构受损或格式不兼容）。您的本地书架、笔记与模型配置均不受影响。"
        >
          <ReaderLayout
            documentRecord={activeDoc}
            preferences={preferences}
            aiSettings={aiSettings}
            dataRevision={dataRevision}
            onBackHome={handleBackHome}
            onOpenSettings={openSettings}
            onSelectChatProfile={handleSelectChatProfile}
          />
        </ErrorBoundary>
      ) : (
        <HomeView
          recentDocs={recentDocs}
          aiSettings={aiSettings}
          isImporting={isImporting}
          onImportFile={handleImportFile}
          onOpenSampleDoc={handleOpenSampleDoc}
          onOpenDocument={handleOpenDocument}
          onDeleteDocument={handleDeleteDocument}
          onOpenSettings={() => openSettings('appearance')}
        />
      )}

      <SettingsModal
        isOpen={settingsOpen}
        activeTab={settingsTab}
        onTabChange={setSettingsTab}
        preferences={preferences}
        onUpdatePreferences={updatePreferences}
        settings={aiSettings}
        onSaveAiSettings={updateAiSettings}
        onDataRestored={async () => {
          setDataRevision((r) => r + 1);
          await refreshRecentDocs();
        }}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}

export default App;
