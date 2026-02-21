import axios from 'axios';

const api = axios.create({
  baseURL: '',            // Vite proxy handles /api → :3001
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

// Future: attach JWT token from auth context
// api.interceptors.request.use((config) => {
//   const token = localStorage.getItem('tuxpanel_token');
//   if (token) config.headers.Authorization = `Bearer ${token}`;
//   return config;
// });

export default api;
