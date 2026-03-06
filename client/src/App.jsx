import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ErrorBoundary from './components/shared/ErrorBoundary';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Terminal from './pages/Terminal';
import RemoteDesktop from './pages/RemoteDesktop';
import Services from './pages/Services';
import Disks from './pages/Disks';
import Containers from './pages/Containers';
import Accounts from './pages/Accounts';
import Troubleshooting from './pages/Troubleshooting';
import { Loader2 } from 'lucide-react';

// ── Route guard — redirects to /login if not authenticated ────────
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gb-bg0-hard">
        <Loader2 size={32} className="animate-spin text-gb-aqua" />
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

// ── Public route — redirects to / if already authenticated ────────
function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gb-bg0-hard">
        <Loader2 size={32} className="animate-spin text-gb-aqua" />
      </div>
    );
  }

  return isAuthenticated ? <Navigate to="/" replace /> : children;
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
            <Routes>
            {/* Public — login page */}
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              }
            />

            {/* Protected — main app */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/terminal" element={<Terminal />} />
              <Route path="/rdp" element={<RemoteDesktop />} />
              <Route path="/disks" element={<Disks />} />
              <Route path="/services" element={<Services />} />
              <Route path="/containers" element={<Containers />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/troubleshooting" element={<Troubleshooting />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
