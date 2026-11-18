import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  authenticateCredentials,
  registerEmployeeAccount,
  getGoogleOAuthConfiguration,
  checkCurrentSession,
  logoutBackend,
} from '../services/authService';
import { SessionTimeoutModal } from '../components/SessionTimeoutModal';

const AuthContext = createContext(null);

const SESSION_STORAGE_KEY = 'crew_auth_session';
const LEGACY_SESSION_STORAGE_KEY = 'worktrack_auth_session';
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE_EXPIRY_MS = 2 * 60 * 1000; // 2 minutes (120 seconds)

export function AuthProvider({ children }) {
  // Session initialization from sessionStorage (Safe tokens & profiles only, no passwords)
  const [session, setSession] = useState(() => {
    try {
      const stored =
        sessionStorage.getItem(SESSION_STORAGE_KEY) ||
        sessionStorage.getItem(LEGACY_SESSION_STORAGE_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      const now = Date.now();
      // If session is already older than 30 minutes since last activity, discard it
      if (now - parsed.lastActivity > IDLE_TIMEOUT_MS) {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });

  const [authError, setAuthError] = useState(null);
  const [sessionWarning, setSessionWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(120);

  const lastActivityRef = useRef(session?.lastActivity || Date.now());
  const timerCheckRef = useRef(null);

  // Sync ref with session
  useEffect(() => {
    if (session?.lastActivity) {
      lastActivityRef.current = session.lastActivity;
    }
  }, [session]);

  /**
   * Reset idle activity timer
   */
  const registerUserActivity = useCallback(() => {
    // Only register activity if warning modal is not currently holding the user
    if (!sessionWarning && session) {
      const now = Date.now();
      // Throttle writes to every 10 seconds to avoid unnecessary state/storage churn
      if (now - lastActivityRef.current > 10000) {
        lastActivityRef.current = now;
        try {
          const updated = { ...session, lastActivity: now };
          sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {
          console.error('Session sync error:', e);
        }
      }
    }
  }, [session, sessionWarning]);

  // Validate and restore session from backend on mount (e.g. after OAuth redirect or refresh)
  useEffect(() => {
    checkCurrentSession().then((res) => {
      if (res.success && res.user) {
        const now = Date.now();
        const activeSession = {
          token: 'active_session',
          user: res.user,
          lastActivity: now,
          loginTime: now,
        };
        setSession(activeSession);
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(activeSession));
        lastActivityRef.current = now;
      }
    });
  }, []);

  /**
   * Logout user and purge session
   */
  const logout = useCallback((reasonMessage = null) => {
    logoutBackend().finally(() => {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
      setSession(null);
      setSessionWarning(false);
      if (reasonMessage) {
        setAuthError(reasonMessage);
      }
    });
  }, []);

  /**
   * Explicitly continue session from warning modal
   */
  const continueSession = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    setSessionWarning(false);
    setRemainingSeconds(120);
    if (session) {
      const updated = { ...session, lastActivity: now };
      setSession(updated);
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updated));
    }
  }, [session]);

  /**
   * Session Watcher Interval (Checks idle time every 1 second)
   */
  useEffect(() => {
    if (!session) return;

    timerCheckRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastActivityRef.current;
      const timeLeftMs = IDLE_TIMEOUT_MS - elapsed;

      if (timeLeftMs <= 0) {
        // Session expired
        logout('Your session has expired after 30 minutes of inactivity. Please sign in again.');
      } else if (timeLeftMs <= WARNING_BEFORE_EXPIRY_MS) {
        // Under 2 minutes remaining: show warning modal
        setSessionWarning(true);
        setRemainingSeconds(Math.max(0, Math.ceil(timeLeftMs / 1000)));
      } else {
        if (sessionWarning) {
          setSessionWarning(false);
        }
      }
    }, 1000);

    return () => clearInterval(timerCheckRef.current);
  }, [session, logout, sessionWarning]);

  /**
   * Activity Event Listeners
   */
  useEffect(() => {
    if (!session) return;

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    const handleActivity = () => registerUserActivity();

    events.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));
    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleActivity));
    };
  }, [session, registerUserActivity]);

  /**
   * Sign In Action
   */
  const login = async (email, password, rememberMe = false) => {
    setAuthError(null);
    const res = await authenticateCredentials(email, password);
    if (!res.success) {
      setAuthError(res.message);
      return res;
    }

    const now = Date.now();
    const newSession = {
      token: res.token,
      user: res.user,
      lastActivity: now,
      loginTime: now,
      rememberMe,
    };

    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));
    lastActivityRef.current = now;
    setSession(newSession);
    return res;
  };

  /**
   * Employee Registration Action
   */
  const register = async (formData) => {
    setAuthError(null);
    return await registerEmployeeAccount(formData);
  };

  /**
   * Update authenticated user data in session immediately
   */
  const updateAuthUser = useCallback((updatedUserData) => {
    setSession((prev) => {
      if (!prev) return null;
      const updated = {
        ...prev,
        user: { ...prev.user, ...updatedUserData },
      };
      try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Session sync error:', e);
      }
      return updated;
    });
  }, []);

  const user = session?.user || null;
  const isAuthenticated = Boolean(user && session?.token);

  return (
    <AuthContext.Provider
      value={{
        user,
        token: session?.token || null,
        isAuthenticated,
        role: user?.role || null,
        authError,
        setAuthError,
        login,
        register,
        logout,
        continueSession,
        sessionWarning,
        getGoogleOAuthConfiguration,
        updateAuthUser,
      }}
    >
      {children}

      {/* 2-minute Warning Idle Modal */}
      {sessionWarning && (
        <SessionTimeoutModal
          remainingSeconds={remainingSeconds}
          onContinue={continueSession}
          onLogout={() => logout('You have signed out of your session.')}
        />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
