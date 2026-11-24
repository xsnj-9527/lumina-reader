import { useCallback, useEffect, useState } from 'react';
import type { ReaderPreferences } from '../types';
import { READING_FONT_MAP } from '../constants/fonts';
import { loadPreferences, savePreferences } from '../services/storage';

export function usePreferences() {
  const [preferences, setPreferences] = useState<ReaderPreferences>(() => loadPreferences());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', preferences.theme);
    document.documentElement.setAttribute('data-pdf-dark-mode', preferences.pdfDarkMode);

    const root = document.documentElement;
    const fontConfig = READING_FONT_MAP[preferences.fontStyle] ?? READING_FONT_MAP['claude-serif'];

    root.style.setProperty('--reader-font-size', `${preferences.fontSize}px`);
    root.style.setProperty('--reader-line-height', String(preferences.lineHeight));
    root.style.setProperty('--reader-max-width', `${preferences.maxWidth}px`);
    root.style.setProperty('--reader-font-family', fontConfig.fontFamily);
    root.style.setProperty('--reader-font-weight', String(fontConfig.fontWeight));
    root.style.setProperty('--reader-letter-spacing', fontConfig.letterSpacing);

    savePreferences(preferences);
  }, [preferences]);

  const updatePreferences = useCallback((patch: Partial<ReaderPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...patch }));
  }, []);

  return { preferences, updatePreferences };
}
