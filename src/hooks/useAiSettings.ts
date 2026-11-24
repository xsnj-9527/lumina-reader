import { useCallback, useState } from 'react';
import type { AiSettings } from '../types';
import { loadAiSettings, saveAiSettings } from '../services/storage';

export function useAiSettings() {
  const [aiSettings, setAiSettingsState] = useState<AiSettings>(() => loadAiSettings());

  const updateAiSettings = useCallback(
    (next: AiSettings | ((prev: AiSettings) => AiSettings)) => {
      setAiSettingsState((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        saveAiSettings(resolved);
        return resolved;
      });
    },
    [],
  );

  return { aiSettings, updateAiSettings };
}
