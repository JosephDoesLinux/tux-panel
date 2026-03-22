import { useState, useEffect } from 'react';

const DEFAULT_PREFS = {
  model: 'gemini-2.5-flash',
  systemPrompt: '',
  temperature: 0.7,
  topP: 0.95,
  useCustomProxy: false,
  proxyUrl: '',
  proxyApiKey: '',
  proxyModel: ''
};

export function useAIPrefs() {
  const [prefs, setPrefs] = useState(() => {
    try {
      const stored = localStorage.getItem('tuxpanel_ai_prefs');
      if (stored) {
        return { ...DEFAULT_PREFS, ...JSON.parse(stored) };
      }
    } catch (err) {
      console.error('Failed to parse AI preferences from localStorage:', err);
    }
    return DEFAULT_PREFS;
  });

  useEffect(() => {
    localStorage.setItem('tuxpanel_ai_prefs', JSON.stringify(prefs));
  }, [prefs]);

  const updatePrefs = (newPrefs) => {
    setPrefs((prev) => ({ ...prev, ...newPrefs }));
  };

  const resetPrefs = () => {
    setPrefs(DEFAULT_PREFS);
  };

  return { prefs, updatePrefs, resetPrefs };
}
