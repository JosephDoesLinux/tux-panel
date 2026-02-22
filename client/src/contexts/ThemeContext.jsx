/**
 * Theme Context — manages dark/light mode across the React app.
 *
 * Provides:
 *   - theme       — 'dark' | 'light'
 *   - toggleTheme — switch between dark and light
 *   - isDark      — convenience boolean
 *
 * Priority: localStorage override > OS preference (prefers-color-scheme).
 * If the user has never toggled manually, the theme follows the system.
 * Once they toggle, their choice is persisted and used until cleared.
 * Sets [data-theme] attribute on <html> element for CSS variable switching.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'tuxpanel-theme';
const mql = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null;

function getSystemTheme() {
  return mql?.matches ? 'dark' : 'light';
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || getSystemTheme();
  });

  // Sync the data-theme attribute on <html> whenever theme changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Listen for OS theme changes — only apply when user hasn't overridden
  useEffect(() => {
    if (!mql) return;
    const handler = (e) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
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
