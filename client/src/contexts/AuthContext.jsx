/**
 * Auth Context — manages authentication state across the React app.
 *
 * Provides:
 *   - user        — current user object ({ username, groups }) or null
 *   - loading     — true while checking initial session
 *   - login()     — authenticate with username/password
 *   - logout()    — clear session
 *   - isAuthenticated — convenience boolean
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true until we check session

  // ── Check existing session on mount ──────────────────────────────
  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    try {
      const res = await api.get('/api/auth/session');
      setUser(res.data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  // ── Login ────────────────────────────────────────────────────────
  const login = useCallback(async (username, password) => {
    const res = await api.post('/api/auth/login', { username, password });
    setUser(res.data.user);
    return res.data.user;
  }, []);

  // ── Logout ───────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // Even if the API call fails, clear local state
    }
    setUser(null);
  }, []);

  const value = {
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export default AuthContext;
