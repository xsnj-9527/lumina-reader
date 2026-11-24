export type DocFormat = 'pdf' | 'docx' | 'md' | 'epub';

export type ThemeMode = 'light' | 'sepia' | 'dark';

export type PdfDarkMode = 'invert' | 'dim';

export type HighlightColor = 'amber' | 'sage' | 'sky';

export type FontStyle = 'claude-serif' | 'editorial-serif' | 'sans';

export type WidthPreset = 'narrow' | 'medium' | 'wide';

export interface ReaderPreferences {
  theme: ThemeMode;
  fontSize: number;
  lineHeight: number;
  maxWidth: number;
  fontStyle: FontStyle;
  pdfZoom: number;
  pdfDarkMode: PdfDarkMode;
}

export type AiProvider = 'gemini' | 'openai';

export type AiScene = 'chat' | 'translate';

export interface AiModelProfile {
  id: string;
  name: string;
  provider: AiProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  disableThinking?: boolean;
}

export interface AiSettings {
  profiles: AiModelProfile[];
  chatProfileId: string;
  translateProfileId: string;
}

export interface DocumentRecord {
  id: string;
  title: string;
  fileName: string;
  format: DocFormat;
  fileSize: number;
  fileData: ArrayBuffer;
  progress: number;
  scrollTop: number;
  currentPage?: number;
  totalPages?: number;
  wordCount?: number;
  estimatedMinutes?: number;
  lastOpenedAt: number;
  createdAt: number;
}

export type DocumentSummary = Omit<DocumentRecord, 'fileData'> & {
  noteCount?: number;
  flashcardCount?: number;
};

export interface TocItem {
  id: string;
  title: string;
  level: number;
  pageNumber?: number;
  children?: TocItem[];
}

export interface PdfHighlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface NoteAnchor {
  pageNumber?: number;
  pdfRects?: PdfHighlightRect[];
  prefix?: string;
  suffix?: string;
}

export interface NoteItem {
  id: string;
  docId: string;
  type: 'highlight' | 'translation';
  quote: string;
  rawQuote?: string;
  translation?: string;
  annotation?: string;
  context?: string;
  color: HighlightColor;
  anchor: NoteAnchor;
  createdAt: number;
}

export interface FlashcardItem {
  id: string;
  docId: string;
  question: string;
  answer: string;
  sourceQuote: string;
  createdAt: number;
}

export interface QuoteContext {
  quote: string;
  translation?: string;
  context?: string;
  actionLabel?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  quoteContext?: QuoteContext;
  createdAt: number;
  isStreaming?: boolean;
  isError?: boolean;
}

export interface ChatThread {
  id: string;
  docId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface DocGuideRecord {
  docId: string;
  summary: string;
  generatedAt: number;
}

export type SelectionTranslateMode = 'word' | 'sentence';

export interface RestoreBackupStats {
  documentsUpdated: number;
  notesMerged: number;
  flashcardsMerged: number;
  threadsMerged: number;
  guidesMerged: number;
  preferencesRestored: boolean;
}

export interface LuminaBackupPayload {
  schema: 'lumina-reader-backup';
  version: 1;
  exportedAt: number;
  preferences?: ReaderPreferences;
  documents: DocumentSummary[];
  notes: NoteItem[];
  flashcards: FlashcardItem[];
  chatThreads: ChatThread[];
  docGuides: DocGuideRecord[];
}

export interface FloatingPosition {
  x: number;
  y: number;
  placement: 'top' | 'bottom';
}

export interface SelectionInfo {
  text: string;
  rawText: string;
  context: string;
  toolbarPosition: FloatingPosition;
  popoverPosition: FloatingPosition;
  anchor: NoteAnchor;
}
