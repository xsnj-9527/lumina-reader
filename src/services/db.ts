import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  ChatThread,
  DocGuideRecord,
  DocumentRecord,
  DocumentSummary,
  FlashcardItem,
  HighlightColor,
  LuminaBackupPayload,
  NoteItem,
  ReaderPreferences,
  RestoreBackupStats,
} from '../types';

interface LuminaDBSchema extends DBSchema {
  documents: {
    key: string;
    value: DocumentRecord;
    indexes: { 'by-lastOpened': number };
  };
  notes: {
    key: string;
    value: NoteItem;
    indexes: { 'by-doc': string };
  };
  flashcards: {
    key: string;
    value: FlashcardItem;
    indexes: { 'by-doc': string };
  };
  chatThreads: {
    key: string;
    value: ChatThread;
    indexes: { 'by-doc': string };
  };
  docGuides: {
    key: string;
    value: DocGuideRecord;
  };
}

const DB_NAME = 'lumina-reader-db';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<LuminaDBSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<LuminaDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<LuminaDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('documents')) {
          const docStore = db.createObjectStore('documents', { keyPath: 'id' });
          docStore.createIndex('by-lastOpened', 'lastOpenedAt');
        }
        if (!db.objectStoreNames.contains('notes')) {
          const noteStore = db.createObjectStore('notes', { keyPath: 'id' });
          noteStore.createIndex('by-doc', 'docId');
        }
        if (!db.objectStoreNames.contains('flashcards')) {
          const cardStore = db.createObjectStore('flashcards', { keyPath: 'id' });
          cardStore.createIndex('by-doc', 'docId');
        }
        if (!db.objectStoreNames.contains('chatThreads')) {
          const threadStore = db.createObjectStore('chatThreads', { keyPath: 'id' });
          threadStore.createIndex('by-doc', 'docId');
        }
        if (!db.objectStoreNames.contains('docGuides')) {
          db.createObjectStore('docGuides', { keyPath: 'docId' });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveDocument(doc: DocumentRecord): Promise<void> {
  const db = await getDb();
  await db.put('documents', doc);
}

export async function getDocumentById(id: string): Promise<DocumentRecord | undefined> {
  const db = await getDb();
  return db.get('documents', id);
}

/**
 * 获取首页最近阅读列表，剥离大体积二进制 fileData，并汇总笔记与闪卡计数。
 */
export async function listDocumentSummaries(): Promise<DocumentSummary[]> {
  const db = await getDb();
  const tx = db.transaction(['documents', 'notes', 'flashcards'], 'readonly');
  const docIndex = tx.objectStore('documents').index('by-lastOpened');
  const noteIndex = tx.objectStore('notes').index('by-doc');
  const cardIndex = tx.objectStore('flashcards').index('by-doc');

  const summaries: DocumentSummary[] = [];
  let cursor = await docIndex.openCursor(null, 'prev');
  while (cursor) {
    const { fileData: _ignored, ...summary } = cursor.value;
    const [noteCount, flashcardCount] = await Promise.all([
      noteIndex.count(summary.id),
      cardIndex.count(summary.id),
    ]);
    summaries.push({
      ...summary,
      noteCount,
      flashcardCount,
    });
    cursor = await cursor.continue();
  }

  await tx.done;
  return summaries;
}

export async function updateDocumentProgress(
  id: string,
  patch: Partial<
    Pick<
      DocumentRecord,
      'progress' | 'scrollTop' | 'currentPage' | 'totalPages' | 'wordCount' | 'estimatedMinutes' | 'lastOpenedAt'
    >
  >,
): Promise<void> {
  const db = await getDb();
  const existing = await db.get('documents', id);
  if (!existing) return;
  await db.put('documents', {
    ...existing,
    ...patch,
    lastOpenedAt: patch.lastOpenedAt ?? existing.lastOpenedAt,
  });
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(
    ['documents', 'notes', 'flashcards', 'chatThreads', 'docGuides'],
    'readwrite',
  );
  await tx.objectStore('documents').delete(id);

  const noteKeys = await tx.objectStore('notes').index('by-doc').getAllKeys(id);
  for (const key of noteKeys) {
    await tx.objectStore('notes').delete(key);
  }

  const cardKeys = await tx.objectStore('flashcards').index('by-doc').getAllKeys(id);
  for (const key of cardKeys) {
    await tx.objectStore('flashcards').delete(key);
  }

  const threadKeys = await tx.objectStore('chatThreads').index('by-doc').getAllKeys(id);
  for (const key of threadKeys) {
    await tx.objectStore('chatThreads').delete(key);
  }

  await tx.objectStore('docGuides').delete(id);

  await tx.done;
}

export async function getNotesByDoc(docId: string): Promise<NoteItem[]> {
  const db = await getDb();
  const list = await db.getAllFromIndex('notes', 'by-doc', docId);
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

export async function addNote(note: NoteItem): Promise<void> {
  const db = await getDb();
  await db.put('notes', note);
}

export async function updateNote(
  noteId: string,
  patch: Partial<Omit<NoteItem, 'id' | 'docId' | 'createdAt'>>,
): Promise<NoteItem | undefined> {
  const db = await getDb();
  const existing = await db.get('notes', noteId);
  if (!existing) return undefined;
  const updated: NoteItem = {
    ...existing,
    ...patch,
  };
  await db.put('notes', updated);
  return updated;
}

export async function deleteNote(noteId: string): Promise<void> {
  const db = await getDb();
  await db.delete('notes', noteId);
}

export async function getFlashcardsByDoc(docId: string): Promise<FlashcardItem[]> {
  const db = await getDb();
  const list = await db.getAllFromIndex('flashcards', 'by-doc', docId);
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

export async function addFlashcards(cards: FlashcardItem[]): Promise<void> {
  if (cards.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('flashcards', 'readwrite');
  for (const card of cards) {
    await tx.store.put(card);
  }
  await tx.done;
}

export async function deleteFlashcard(cardId: string): Promise<void> {
  const db = await getDb();
  await db.delete('flashcards', cardId);
}

export async function getChatThreadsByDoc(docId: string): Promise<ChatThread[]> {
  const db = await getDb();
  const list = await db.getAllFromIndex('chatThreads', 'by-doc', docId);
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveChatThread(thread: ChatThread): Promise<void> {
  const db = await getDb();
  const sanitized: ChatThread = {
    ...thread,
    messages: thread.messages.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
  };
  await db.put('chatThreads', sanitized);
}

export async function deleteChatThread(threadId: string): Promise<void> {
  const db = await getDb();
  await db.delete('chatThreads', threadId);
}

export async function getDocGuide(docId: string): Promise<DocGuideRecord | undefined> {
  const db = await getDb();
  return db.get('docGuides', docId);
}

export async function saveDocGuide(guide: DocGuideRecord): Promise<void> {
  const db = await getDb();
  await db.put('docGuides', guide);
}

/**
 * 导出轻量化本地整库备份（包含文档元数据摘要、笔记、闪卡、话题、导读与外观偏好；
 * 不含大体积文档二进制 fileData，且严禁导出任何 API Key）。
 */
export async function exportBackupData(
  preferences: ReaderPreferences,
): Promise<LuminaBackupPayload> {
  const db = await getDb();
  const [documents, notes, flashcards, chatThreads, docGuides] = await Promise.all([
    listDocumentSummaries(),
    db.getAll('notes'),
    db.getAll('flashcards'),
    db.getAll('chatThreads'),
    db.getAll('docGuides'),
  ]);

  return {
    schema: 'lumina-reader-backup',
    version: 1,
    exportedAt: Date.now(),
    preferences: { ...preferences },
    documents,
    notes,
    flashcards,
    chatThreads,
    docGuides,
  };
}

export function validateBackupPayload(raw: unknown): LuminaBackupPayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('备份文件格式无效：不是有效的 JSON 对象。');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.schema !== 'lumina-reader-backup' || typeof obj.version !== 'number') {
    throw new Error('备份文件标识不匹配：请确认选择的是 Lumina Reader 导出的备份文件。');
  }
  if (
    !Array.isArray(obj.notes) ||
    !Array.isArray(obj.flashcards) ||
    !Array.isArray(obj.chatThreads) ||
    !Array.isArray(obj.docGuides)
  ) {
    throw new Error('备份文件缺少必要的笔记、闪卡或伴读数据结构。');
  }
  return obj as unknown as LuminaBackupPayload;
}

function normalizeHighlightColor(raw: unknown): HighlightColor {
  if (raw === 'sage' || raw === 'sky' || raw === 'amber') return raw;
  return 'amber';
}

/**
 * 安全合并写入备份文件至 IndexedDB（不清空未冲突现有数据）。
 * - 文档摘要：仅更新本地已有同 ID 文档的进度与字数统计（完整保留 fileData 原文二进制）。
 * - 笔记 / 闪卡 / 话题 / 导读：按主键安全合并。
 */
export async function importBackupData(raw: unknown): Promise<{
  stats: RestoreBackupStats;
  preferences?: ReaderPreferences;
}> {
  const payload = validateBackupPayload(raw);
  const db = await getDb();

  const stats: RestoreBackupStats = {
    documentsUpdated: 0,
    notesMerged: 0,
    flashcardsMerged: 0,
    threadsMerged: 0,
    guidesMerged: 0,
    preferencesRestored: false,
  };

  const tx = db.transaction(
    ['documents', 'notes', 'flashcards', 'chatThreads', 'docGuides'],
    'readwrite',
  );

  if (Array.isArray(payload.documents)) {
    const docStore = tx.objectStore('documents');
    for (const summary of payload.documents) {
      if (!summary || typeof summary.id !== 'string') continue;
      const existing = await docStore.get(summary.id);
      if (existing) {
        await docStore.put({
          ...existing,
          progress: typeof summary.progress === 'number' ? summary.progress : existing.progress,
          scrollTop: typeof summary.scrollTop === 'number' ? summary.scrollTop : existing.scrollTop,
          currentPage:
            typeof summary.currentPage === 'number' ? summary.currentPage : existing.currentPage,
          totalPages:
            typeof summary.totalPages === 'number' ? summary.totalPages : existing.totalPages,
          wordCount: typeof summary.wordCount === 'number' ? summary.wordCount : existing.wordCount,
          estimatedMinutes:
            typeof summary.estimatedMinutes === 'number'
              ? summary.estimatedMinutes
              : existing.estimatedMinutes,
          lastOpenedAt: Math.max(existing.lastOpenedAt, summary.lastOpenedAt || 0),
        });
        stats.documentsUpdated += 1;
      }
    }
  }

  const noteStore = tx.objectStore('notes');
  for (const item of payload.notes) {
    if (!item || typeof item.id !== 'string' || typeof item.docId !== 'string') continue;
    await noteStore.put({
      ...item,
      color: normalizeHighlightColor(item.color),
      anchor: item.anchor ?? {},
    });
    stats.notesMerged += 1;
  }

  const cardStore = tx.objectStore('flashcards');
  for (const card of payload.flashcards) {
    if (!card || typeof card.id !== 'string' || typeof card.docId !== 'string') continue;
    await cardStore.put(card);
    stats.flashcardsMerged += 1;
  }

  const threadStore = tx.objectStore('chatThreads');
  for (const thread of payload.chatThreads) {
    if (!thread || typeof thread.id !== 'string' || typeof thread.docId !== 'string') continue;
    await threadStore.put({
      ...thread,
      messages: Array.isArray(thread.messages)
        ? thread.messages.map((m) => ({ ...m, isStreaming: false }))
        : [],
    });
    stats.threadsMerged += 1;
  }

  const guideStore = tx.objectStore('docGuides');
  for (const guide of payload.docGuides) {
    if (!guide || typeof guide.docId !== 'string' || typeof guide.summary !== 'string') continue;
    await guideStore.put(guide);
    stats.guidesMerged += 1;
  }

  await tx.done;

  let restoredPrefs: ReaderPreferences | undefined;
  if (payload.preferences && typeof payload.preferences === 'object') {
    restoredPrefs = payload.preferences;
    stats.preferencesRestored = true;
  }

  return { stats, preferences: restoredPrefs };
}
