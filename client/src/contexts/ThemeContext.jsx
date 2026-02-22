/**
 * Theme Context — manages dark/light mode across the React app.
 *
 * Provides:
 *   - theme       — 'dark' | 'light'
 *   - toggleTheme — switch between dark and light
 *   - isDark      — convenience boolean
 *
 * Persists choice to localStorage. Defaults to dark.
 * Sets [data-theme] attribute on <html> element for CSS variable switching.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('tuxpanel-theme') || 'dark';
  });

  // Sync the data-theme attribute on <html> whenever theme changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tuxpanel-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
