import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach CSRF token from sessionStorage for state-changing requests.
// The backend issues the token via GET /auth/csrf (session-protected) and
// expects it back as the x-csrf-token header. It is never a Bearer token.
api.interceptors.request.use((config) => {
  const csrfToken = sessionStorage.getItem('teamdesk_csrf');
  if (csrfToken) {
    config.headers['x-csrf-token'] = csrfToken;
  }
  return config;
});

// Response interceptor to handle expired sessions / 401 Unauthorized
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('teamdesk_csrf');
    }
    return Promise.reject(error);
  },
);

export default api;
