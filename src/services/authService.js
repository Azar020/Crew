// ─── Crew Authentication Service by Transacty ─────────────────────────
import api from './api';

export function getAllUsers() {
  return [];
}

/**
 * Authenticate credentials against backend database
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, message?: string, token?: string, user?: object}>}
 */
export async function authenticateCredentials(email, password) {
  try {
    const res = await api.post('/auth/login', {
      email: email.trim().toLowerCase(),
      password,
    });
    if (res.data?.success && res.data?.employee) {
      if (res.data.csrfToken) {
        sessionStorage.setItem('teamdesk_csrf', res.data.csrfToken);
      }
      return {
        success: true,
        user: {
          ...res.data.employee,
          status: 'active',
        },
        token: res.data.csrfToken,
      };
    }
    return {
      success: false,
      message: res.data?.message || 'Authentication failed',
    };
  } catch (err) {
    const message =
      err.response?.data?.message ||
      err.response?.data?.error ||
      'Invalid email address or password. Please try again.';
    return {
      success: false,
      message,
    };
  }
}

/**
 * Register a new employee account (PUBLIC REGISTRATION ENFORCES EMPLOYEE ROLE)
 * @param {{ name: string, employeeId: string, email: string, password: string }} data
 * @returns {Promise<{success: boolean, message?: string, user?: object}>}
 */
export async function registerEmployeeAccount({ name, employeeId, email, password }) {
  try {
    const res = await api.post('/auth/register', {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      employeeId: employeeId?.trim() || undefined,
    });

    if (res.data?.success) {
      return {
        success: true,
        user: res.data.employee,
      };
    }
    return {
      success: false,
      message: res.data?.message || 'Registration failed',
    };
  } catch (err) {
    const message =
      err.response?.data?.message ||
      err.response?.data?.error ||
      'Registration failed. Please check your details and try again.';
    return {
      success: false,
      message,
    };
  }
}

/**
 * Check and restore current session from backend cookie
 */
export async function checkCurrentSession() {
  try {
    const res = await api.get('/auth/me');
    if (res.data?.employee) {
      try {
        const csrfRes = await api.get('/auth/csrf');
        if (csrfRes.data?.csrfToken) {
          sessionStorage.setItem('teamdesk_csrf', csrfRes.data.csrfToken);
        }
      } catch {
        // non-blocking
      }
      return {
        success: true,
        user: {
          ...res.data.employee,
          status: 'active',
        },
      };
    }
  } catch {
    // No active session
  }
  return { success: false };
}

/**
 * Revoke backend session and purge tokens
 */
export async function logoutBackend() {
  try {
    await api.post('/auth/logout');
  } catch (err) {
    console.error('Logout error:', err);
  } finally {
    sessionStorage.removeItem('teamdesk_csrf');
    sessionStorage.removeItem('crew_auth_session');
  }
}

export function getGoogleOAuthConfiguration() {
  return getGoogleOAuthConfig();
}

/**
 * Inspect Google OAuth configuration readiness
 */
export function getGoogleOAuthConfig() {
  const backendAuthUrl = '/auth/login';

  return {
    isConfigured: true,
    backendAuthUrl,
    missingReason: '',
  };
}
