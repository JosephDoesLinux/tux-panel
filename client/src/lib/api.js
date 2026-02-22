import axios from 'axios';

const api = axios.create({
  baseURL: '',            // Vite proxy handles /api → :3001
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,  // Send cookies with every request (httpOnly JWT)
});

// ── 401 interceptor — redirect to login on expired/invalid session ──
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      !error.config.url?.includes('/api/auth/')
    ) {
      // Session expired — reload to trigger the auth check
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
