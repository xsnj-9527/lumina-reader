import type { FontStyle } from '../types';

export interface ReadingFontOption {
  id: FontStyle;
  label: string;
  subtitle: string;
  fontFamily: string;
  fontWeight: number;
  letterSpacing: string;
}

export const UI_FONT_FAMILY =
  "'DM Sans Variable', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";

const CJK_SERIF_FALLBACK =
  "Georgia, 'Source Han Serif SC', 'Noto Serif SC', 'Songti SC', serif";

export const READING_FONT_OPTIONS: ReadingFontOption[] = [
  {
    id: 'claude-serif',
    label: '典雅书卷',
    subtitle: 'Source Serif 4',
    fontFamily: `'Source Serif 4 Variable', ${CJK_SERIF_FALLBACK}`,
    fontWeight: 420,
    letterSpacing: '-0.006em',
  },
  {
    id: 'editorial-serif',
    label: '现代刊物',
    subtitle: 'Newsreader',
    fontFamily: `'Newsreader Variable', ${CJK_SERIF_FALLBACK}`,
    fontWeight: 400,
    letterSpacing: '0.002em',
  },
  {
    id: 'sans',
    label: '现代无衬线',
    subtitle: 'DM Sans',
    fontFamily: UI_FONT_FAMILY,
    fontWeight: 400,
    letterSpacing: '0.004em',
  },
];

export const READING_FONT_MAP: Record<FontStyle, ReadingFontOption> = {
  'claude-serif': READING_FONT_OPTIONS[0],
  'editorial-serif': READING_FONT_OPTIONS[1],
  sans: READING_FONT_OPTIONS[2],
};
