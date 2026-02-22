import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, AlertCircle, Lock } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(username, password);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gb-bg0-hard">
      <div className="w-full max-w-sm mx-4">
        {/* ── Brand ─────────────────────────────────────────────── */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-3">
            <span className="text-5xl">🐧</span>
          </div>
          <h1 className="text-3xl font-black text-gb-fg0 tracking-tight uppercase">
            TuxPanel
          </h1>
          <p className="text-gb-fg4 text-sm mt-1">
            Linux Server Management
          </p>
        </div>

        {/* ── Login Card ────────────────────────────────────────── */}
        <form
          onSubmit={handleSubmit}
          className="bg-gb-bg0 border-2 border-gb-bg2 p-6 shadow-2xl"
        >
          <div className="flex items-center gap-2 mb-5">
            <Lock size={18} className="text-gb-aqua" />
            <h2 className="text-lg font-bold text-gb-fg0">Sign In</h2>
          </div>

          <p className="text-xs text-gb-fg4 mb-5">
            Log in with your Linux system credentials.
            Your account must be a member of the <code className="text-gb-fg2">tuxpanel</code> group.
          </p>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 mb-4 bg-gb-bg1 border-2 border-gb-red-dim p-3">
              <AlertCircle size={16} className="text-gb-red mt-0.5 shrink-0" />
              <p className="text-gb-red text-sm">{error}</p>
            </div>
          )}

          {/* Username */}
          <div className="mb-4">
            <label
              htmlFor="username"
              className="block text-xs text-gb-fg3 mb-1.5 font-semibold uppercase tracking-wide"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              placeholder="joseph"
              className="w-full bg-gb-bg1 text-gb-fg1 px-3 py-2.5 text-sm border-2 border-gb-bg3 focus:border-gb-aqua focus:outline-none transition-colors placeholder:text-gb-bg4"
            />
          </div>

          {/* Password */}
          <div className="mb-6">
            <label
              htmlFor="password"
              className="block text-xs text-gb-fg3 mb-1.5 font-semibold uppercase tracking-wide"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="w-full bg-gb-bg1 text-gb-fg1 px-3 py-2.5 text-sm border-2 border-gb-bg3 focus:border-gb-aqua focus:outline-none transition-colors placeholder:text-gb-bg4"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gb-aqua text-gb-bg0-hard font-black uppercase tracking-wide border-2 border-gb-aqua hover:bg-gb-aqua-dim disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Authenticating…
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* ── Footer ────────────────────────────────────────────── */}
        <p className="text-center text-xs text-gb-bg4 mt-6">
          v0.1.0 · Secured by Linux PAM
        </p>
      </div>
    </div>
  );
}
