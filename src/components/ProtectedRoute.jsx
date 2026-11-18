import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Route guard that validates authentication and restricts access based on authorized role.
 * Prevents Employees from accessing Admin routes, and unauthenticated users from accessing any protected routes.
 */
export function ProtectedRoute({ allowedRoles = [], children }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated || !user) {
    // Unauthenticated: Redirect to login with previous path state
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Role validation
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    // Role mismatch: Redirect user to their own portal dashboard
    if (user.role === 'admin') {
      return <Navigate to="/admin/dashboard" replace />;
    }
    return <Navigate to="/employee/dashboard" replace />;
  }

  return children;
}

/**
 * Route guard for public pages (Login, Register).
 * Automatically redirects already-authenticated users to their respective portal.
 */
export function PublicRoute({ children }) {
  const { isAuthenticated, user } = useAuth();

  if (isAuthenticated && user) {
    if (user.role === 'admin') {
      return <Navigate to="/admin/dashboard" replace />;
    }
    return <Navigate to="/employee/dashboard" replace />;
  }

  return children;
}
