import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  X,
  ShieldCheck,
  Building2,
  Users,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeToggle } from '../../components/ThemeToggle';
import { TransactyLogo } from '../../components/TransactyLogo';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, setAuthError, getGoogleOAuthConfiguration } = useAuth();
  const { isDark } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [showGoogleConfigModal, setShowGoogleConfigModal] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');

  const regSuccessMsg = location.state?.message;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    setAuthError(null);

    if (!email.trim() || !password) {
      setLocalError('Please enter both your email address and password.');
      return;
    }

    setLoading(true);
    const res = await login(email.trim(), password, rememberMe);
    setLoading(false);

    if (res.success) {
      if (res.user.role === 'admin') {
        navigate('/admin/dashboard', { replace: true });
      } else {
        navigate('/employee/dashboard', { replace: true });
      }
    } else {
      setLocalError(res.message);
    }
  };

  const handleGoogleClick = () => {
    const config = getGoogleOAuthConfiguration();
    if (!config.isConfigured) {
      setShowGoogleConfigModal(true);
    } else {
      window.location.href = config.backendAuthUrl || '/api/auth/google';
    }
  };

  const handleForgotSubmit = (e) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotSuccess(true);
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[var(--bg-main)] text-[var(--text-primary)] transition-colors duration-200">
      {/* ─── LEFT WALLPAPER PANEL (55–60% width on Desktop) ─── */}
      <div className="relative w-full lg:w-[58%] min-h-[280px] lg:min-h-screen bg-[#0F0700] text-[#F3E8D6] flex flex-col justify-between p-8 sm:p-12 lg:p-16 overflow-hidden select-none">
        {/* Subtle geometric & fintech pattern overlay */}
        <div className="absolute inset-0 opacity-[0.07] pointer-events-none">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="fintech-grid" width="48" height="48" patternUnits="userSpaceOnUse">
                <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#F3E8D6" strokeWidth="1" />
                <circle cx="48" cy="0" r="1.5" fill="#9D8F82" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#fintech-grid)" />
          </svg>
        </div>

        {/* Ambient Warm Gradient Accent */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#9D8F82]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-[#9D8F82]/8 rounded-full blur-3xl pointer-events-none" />

        {/* Top brand mark on wallpaper */}
        <div className="relative z-10 flex items-center justify-between">
          <TransactyLogo variant="dark" height={34} />
          <div className="flex items-center gap-2 text-xs font-medium text-[#9D8F82]">
            <span className="w-2 h-2 rounded-full bg-[#9D8F82]" />
            Enterprise Suite
          </div>
        </div>

        {/* Center Editorial / Brand Messaging */}
        <div className="relative z-10 my-auto py-10 lg:py-0 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1A1512] border border-[#9D8F82]/25 text-[#9D8F82] text-xs font-semibold tracking-wider uppercase mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#9D8F82]" />
            Workforce Management
          </div>

          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#F3E8D6] leading-[1.15] mb-6">
            One team. <br />
            One workspace. <br />
            <span className="text-[#9D8F82]">Better workdays.</span>
          </h2>

          <p className="text-[#9D8F82] text-sm sm:text-base leading-relaxed mb-10 max-w-lg">
            Empower your workforce with synchronized time tracking, streamlined leave approvals,
            and high-precision productivity analytics designed for modern organizations.
          </p>

          {/* Value propositions */}
          <div className="grid grid-cols-3 gap-4 border-t border-[#9D8F82]/20 pt-6">
            <div>
              <div className="flex items-center gap-1.5 text-[#F3E8D6] font-display font-bold text-lg">
                <Users size={16} className="text-[#9D8F82]" /> 100%
              </div>
              <div className="text-xs text-[#9D8F82] mt-0.5">Role Unified</div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[#F3E8D6] font-display font-bold text-lg">
                <Clock size={16} className="text-[#9D8F82]" /> 0.1s
              </div>
              <div className="text-xs text-[#9D8F82] mt-0.5">Live Audit</div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[#F3E8D6] font-display font-bold text-lg">
                <ShieldCheck size={16} className="text-[#9D8F82]" /> SOC-2
              </div>
              <div className="text-xs text-[#9D8F82] mt-0.5">Secure Session</div>
            </div>
          </div>
        </div>

        {/* Bottom footer note on wallpaper */}
        <div className="relative z-10 text-xs text-[#9D8F82]/80 flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-[#9D8F82]/15">
          <span>&copy; {new Date().getFullYear()} Transacty, Inc. All rights reserved.</span>
          <span className="text-[#9D8F82]/60">Crew v2.0 &bull; Transacty Core</span>
        </div>
      </div>

      {/* ─── RIGHT LOGIN FORM PANEL (40–45% width on Desktop) ─── */}
      <div className="relative w-full lg:w-[42%] flex flex-col justify-between p-6 sm:p-10 lg:p-14 bg-[var(--bg-main)]">
        {/* Top utility bar */}
        <div className="flex items-center justify-between mb-8">
          <div className="lg:hidden">
            <TransactyLogo variant="auto" height={28} />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-[var(--text-secondary)] hidden sm:inline">Theme</span>
            <ThemeToggle />
          </div>
        </div>

        {/* Form Container */}
        <div className="w-full max-w-md mx-auto my-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="inline-block px-2.5 py-1 rounded bg-[var(--active-bg)] text-[var(--active-text)] text-[11px] font-bold tracking-wider uppercase mb-3">
              CREW WORKSPACE
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
              Welcome back
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1.5">
              Sign in to continue to your Crew workspace.
            </p>
          </div>

          {/* Registration Success Banner */}
          {regSuccessMsg && (
            <div className="mb-6 p-4 rounded-xl border border-[#9D8F82]/30 bg-[#9D8F82]/10 text-[var(--text-primary)] text-xs flex items-start gap-3">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-[#9D8F82]" />
              <span>{regSuccessMsg}</span>
            </div>
          )}

          {/* Error Banner */}
          {localError && (
            <div className="mb-6 p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400 text-xs flex items-start gap-3">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-500" />
              <span>{localError}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 select-none">
            {/* Email Field */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  disabled={loading}
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] focus:ring-1 focus:ring-[var(--border-focus)] transition-all disabled:opacity-50"
                />
                <Mail
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-[var(--text-primary)]">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your account password"
                  disabled={loading}
                  className="w-full pl-10 pr-11 py-2.5 text-sm rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] focus:ring-1 focus:ring-[var(--border-focus)] transition-all disabled:opacity-50"
                />
                <Lock
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Remember Me Option */}
            <div className="flex items-center pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--border-strong)] text-[#0F0700] focus:ring-0 cursor-pointer"
                />
                <span>Remember this workstation</span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] active:scale-[0.99]"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            {/* Google Authentication */}
            <div className="pt-2">
              <div className="relative my-4 flex items-center justify-center">
                <div className="border-t border-[var(--border-subtle)] w-full" />
                <span className="bg-[var(--bg-main)] px-3 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider absolute">
                  Or
                </span>
              </div>

              <button
                type="button"
                onClick={handleGoogleClick}
                className="w-full py-2.5 px-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] text-sm font-semibold transition-all flex items-center justify-center gap-2.5"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>
            </div>
          </form>

          {/* Registration link */}
          <div className="mt-8 text-center text-xs text-[var(--text-secondary)]">
            <span>New employee joining Crew? </span>
            <Link
              to="/register"
              className="font-bold text-[var(--text-primary)] hover:underline ml-1"
            >
              Register account &rarr;
            </Link>
          </div>
        </div>

        {/* Bottom micro footer */}
        <div className="mt-8 pt-4 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] flex justify-between items-center">
          <span>Transacty Crew Platform</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#9D8F82]" /> Operational
          </span>
        </div>
      </div>

      {/* ─── Forgot Password Modal ─── */}
      {showForgotModal && (
        <div className="modal-backdrop">
          <div className="auth-modal">
            <button
              onClick={() => {
                setShowForgotModal(false);
                setForgotSuccess(false);
              }}
              className="modal-close"
              aria-label="Close"
            >
              <X size={16} />
            </button>

            <div className="w-10 h-10 rounded-xl bg-[var(--active-bg)] text-[var(--active-text)] flex items-center justify-center mb-4">
              <Lock size={20} />
            </div>

            <h3 className="font-display font-bold text-lg text-[var(--text-primary)]">
              Reset your password
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1 mb-4">
              Enter your corporate email address and we will dispatch a secure reset key.
            </p>

            {forgotSuccess ? (
              <div className="p-4 rounded-xl border border-[#9D8F82]/30 bg-[#9D8F82]/10 text-[var(--text-primary)] text-xs">
                Password recovery instructions have been dispatched to <strong>{forgotEmail}</strong>.
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-3">
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full text-xs"
                />
                <button type="submit" className="primary-btn w-full">
                  Send Recovery Link
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ─── Google OAuth Notice Modal ─── */}
      {showGoogleConfigModal && (
        <div className="modal-backdrop">
          <div className="auth-modal">
            <button
              onClick={() => setShowGoogleConfigModal(false)}
              className="modal-close"
              aria-label="Close"
            >
              <X size={16} />
            </button>

            <div className="w-10 h-10 rounded-xl bg-[#9D8F82]/15 text-[var(--text-secondary)] flex items-center justify-center mb-4">
              <ShieldCheck size={20} />
            </div>

            <h3 className="font-display font-bold text-lg text-[var(--text-primary)]">
              Google Workspace SSO
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1 mb-4 leading-relaxed">
              Google OAuth integration requires client credentials in production environment
              (<code className="px-1 py-0.5 rounded bg-[var(--bg-surface-hover)]">VITE_GOOGLE_CLIENT_ID</code>).
              To explore Crew, please sign in with your corporate employee credentials.
            </p>

            <button
              onClick={() => setShowGoogleConfigModal(false)}
              className="primary-btn w-full"
            >
              Understood
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
