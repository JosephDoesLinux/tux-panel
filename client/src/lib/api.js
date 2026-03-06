import axios from 'axios';

const api = axios.create({
  baseURL: '',            // Vite proxy handles /api → :3001
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,  // Send cookies with every request (httpOnly JWT)
});

// ── 401 interceptor — notify auth context on expired/invalid session ──
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      !error.config.url?.includes('/api/auth/')
    ) {
      // Fire a custom event so AuthContext can clear state & redirect via React Router
      window.dispatchEvent(new Event('auth:expired'));
    }
    return Promise.reject(error);
  }
);

export default api;
