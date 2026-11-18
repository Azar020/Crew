import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { EmployeeProvider } from './context/EmployeeContext';
import { ProtectedRoute, PublicRoute } from './components/ProtectedRoute';

import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { EmployeePortal } from './pages/employee/EmployeePortal';
import { AdminPortal } from './pages/admin/AdminPortal';

/**
 * Root index redirector based on authenticated session and role
 */
function RootRedirect() {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <Navigate to="/employee/dashboard" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <EmployeeProvider>
            <Routes>
              {/* Public Auth Routes */}
              <Route
                path="/login"
                element={
                  <PublicRoute>
                    <LoginPage />
                  </PublicRoute>
                }
              />
              <Route
                path="/register"
                element={
                  <PublicRoute>
                    <RegisterPage />
                  </PublicRoute>
                }
              />

              {/* Protected Employee Portal Routes */}
              <Route
                path="/employee/*"
                element={
                  <ProtectedRoute allowedRoles={['employee']}>
                    <EmployeePortal />
                  </ProtectedRoute>
                }
              />

              {/* Protected Admin Portal Routes */}
              <Route
                path="/admin/*"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AdminPortal />
                  </ProtectedRoute>
                }
              />

              {/* Default Catch-all & Root Navigation */}
              <Route path="/" element={<RootRedirect />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </EmployeeProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
