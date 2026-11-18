import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  User,
  BadgeCheck,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  X,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeToggle } from '../../components/ThemeToggle';
import { TransactyLogo } from '../../components/TransactyLogo';

export function RegisterPage() {
  const navigate = useNavigate();
  const { register, getGoogleOAuthConfiguration } = useAuth();
  const { isDark } = useTheme();

  const [fullName, setFullName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showGoogleModal, setShowGoogleModal] = useState(false);

  // Live password validation criteria:
  // Rule: ^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$
  const passwordCriteria = useMemo(() => {
    return {
      minLength: password.length >= 8,
      hasLetter: /[A-Za-z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecial: /[^A-Za-z0-9]/.test(password),
    };
  }, [password]);

  const isPasswordValid =
    passwordCriteria.minLength &&
    passwordCriteria.hasLetter &&
    passwordCriteria.hasNumber &&
    passwordCriteria.hasSpecial;

  // Password strength calculation
  const strengthScore = useMemo(() => {
    if (!password) return 0;
    let score = 0;
    if (passwordCriteria.minLength) score += 1;
    if (passwordCriteria.hasLetter) score += 1;
    if (passwordCriteria.hasNumber) score += 1;
    if (passwordCriteria.hasSpecial) score += 1;
    if (password.length >= 12) score += 1;
    return score;
  }, [password, passwordCriteria]);

  const strengthLabel = useMemo(() => {
    if (!password) return { text: '', color: 'transparent' };
    if (strengthScore <= 2) return { text: 'Weak', color: '#ef4444' };
    if (strengthScore === 3) return { text: 'Fair', color: '#f59e0b' };
    if (strengthScore === 4) return { text: 'Good', color: '#3b82f6' };
    return { text: 'Strong', color: '#9D8F82' };
  }, [password, strengthScore]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!fullName.trim() || !employeeId.trim() || !email.trim() || !password || !confirmPassword) {
      setErrorMessage('All registration fields are required.');
      return;
    }

    if (!isPasswordValid) {
      setErrorMessage('Please ensure your password satisfies all 4 security criteria.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Password and Confirm Password do not match.');
      return;
    }

    setLoading(true);
    const res = await register({
      name: fullName.trim(),
      employeeId: employeeId.trim(),
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (res.success) {
      navigate('/login', {
        state: {
          message: `Account created successfully for ${fullName}! Please sign in with your credentials.`,
        },
        replace: true,
      });
    } else {
      setErrorMessage(res.message);
    }
  };

  const handleGoogleClick = () => {
    const config = getGoogleOAuthConfiguration();
    if (!config.isConfigured) {
      setShowGoogleModal(true);
    } else {
      window.location.href = config.backendAuthUrl || '/api/auth/google';
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[var(--bg-main)] text-[var(--text-primary)] transition-colors duration-200">
      {/* ─── LEFT WALLPAPER PANEL (55–60% width on Desktop) ─── */}
      <div className="relative w-full lg:w-[55%] min-h-[280px] lg:min-h-screen bg-[#0F0700] text-[#F3E8D6] flex flex-col justify-between p-8 sm:p-12 lg:p-16 overflow-hidden select-none">
        {/* Subtle geometric fintech pattern */}
        <div className="absolute inset-0 opacity-[0.07] pointer-events-none">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="fintech-grid-reg" width="48" height="48" patternUnits="userSpaceOnUse">
                <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#F3E8D6" strokeWidth="1" />
                <circle cx="48" cy="0" r="1.5" fill="#9D8F82" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#fintech-grid-reg)" />
          </svg>
        </div>

        {/* Ambient Gradient Accent */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#9D8F82]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-[#9D8F82]/8 rounded-full blur-3xl pointer-events-none" />

        {/* Brand Header */}
        <div className="relative z-10 flex items-center justify-between">
          <TransactyLogo variant="dark" height={34} />
          <div className="flex items-center gap-2 text-xs font-medium text-[#9D8F82]">
            <span className="w-2 h-2 rounded-full bg-[#9D8F82]" />
            Employee Onboarding
          </div>
        </div>

        {/* Center Content */}
        <div className="relative z-10 my-auto py-10 lg:py-0 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1A1512] border border-[#9D8F82]/25 text-[#9D8F82] text-xs font-semibold tracking-wider uppercase mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#9D8F82]" />
            Join Your Crew
          </div>

          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#F3E8D6] leading-[1.15] mb-6">
            Seamless attendance. <br />
            Accurate shifts. <br />
            <span className="text-[#9D8F82]">Designed for talent.</span>
          </h2>

          <p className="text-[#9D8F82] text-sm sm:text-base leading-relaxed mb-8 max-w-lg">
            Create your personalized employee profile to synchronize check-ins, record shift breaks,
            submit leave petitions, and communicate directly with management.
          </p>

          <div className="space-y-3 border-t border-[#9D8F82]/20 pt-6">
            <div className="flex items-center gap-3 text-xs text-[#F3E8D6]">
              <span className="w-5 h-5 rounded-full bg-[#9D8F82]/20 text-[#9D8F82] flex items-center justify-center text-[10px] font-bold">
                ✓
              </span>
              <span>Instant synchronized shift timer & daily break logs</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-[#F3E8D6]">
              <span className="w-5 h-5 rounded-full bg-[#9D8F82]/20 text-[#9D8F82] flex items-center justify-center text-[10px] font-bold">
                ✓
              </span>
              <span>Dynamic leave balance ledger with audit trail</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-[#F3E8D6]">
              <span className="w-5 h-5 rounded-full bg-[#9D8F82]/20 text-[#9D8F82] flex items-center justify-center text-[10px] font-bold">
                ✓
              </span>
              <span>Real-time company broadcasts & schedule calendar</span>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <div className="relative z-10 text-xs text-[#9D8F82]/80 flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-[#9D8F82]/15">
          <span>&copy; {new Date().getFullYear()} Transacty, Inc. All rights reserved.</span>
          <span className="text-[#9D8F82]/60">Crew Identity Security</span>
        </div>
      </div>

      {/* ─── RIGHT REGISTRATION FORM PANEL (ONE FIELD BELOW ANOTHER) ─── */}
      <div className="relative w-full lg:w-[45%] flex flex-col justify-between p-6 sm:p-10 lg:p-14 bg-[var(--bg-main)]">
        {/* Top utility bar */}
        <div className="flex items-center justify-between mb-6">
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
          <div className="mb-6">
            <div className="inline-block px-2.5 py-1 rounded bg-[var(--active-bg)] text-[var(--active-text)] text-[11px] font-bold tracking-wider uppercase mb-2">
              EMPLOYEE ONBOARDING
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
              Register the Employee Account
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Create your Crew account to get started.
            </p>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-5 p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400 text-xs flex items-start gap-3">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form: One below another */}
          <form onSubmit={handleSubmit} className="space-y-4 select-none">
            {/* 1. Full Name */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Full Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Courtney Henry"
                  disabled={loading}
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] focus:ring-1 focus:ring-[var(--border-focus)] transition-all disabled:opacity-50"
                />
                <User
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none"
                />
              </div>
            </div>

            {/* 2. Employee ID */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Employee ID
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
                  placeholder="e.g. EMP-1044"
                  disabled={loading}
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] focus:ring-1 focus:ring-[var(--border-focus)] transition-all disabled:opacity-50 uppercase"
                />
                <BadgeCheck
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none"
                />
              </div>
            </div>

            {/* 3. Email Address */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Corporate Email Address
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

            {/* 4. Password */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-[var(--text-primary)]">
                  Password
                </label>
                {password && (
                  <span
                    className="text-[11px] font-bold"
                    style={{ color: strengthLabel.color }}
                  >
                    Strength: {strengthLabel.text}
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
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

              {/* Password strength meter bar */}
              {password && (
                <div className="w-full h-1.5 rounded-full bg-[var(--border-subtle)] mt-2 overflow-hidden flex gap-1">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className="h-full flex-1 rounded-full transition-all duration-300"
                      style={{
                        backgroundColor:
                          strengthScore >= step ? strengthLabel.color : 'transparent',
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Live Password Validation Indicators */}
              <div className="mt-2.5 p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-1.5">
                <span className="block text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)] mb-1">
                  Password Requirements:
                </span>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <div
                    className={`flex items-center gap-1.5 ${passwordCriteria.minLength ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-secondary)]'
                      }`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${passwordCriteria.minLength
                        ? 'bg-[#9D8F82] text-[#F3E8D6]'
                        : 'bg-[var(--border-subtle)] text-[var(--text-secondary)]'
                        }`}
                    >
                      {passwordCriteria.minLength ? <Check size={10} /> : '•'}
                    </span>
                    <span>Min. 8 characters</span>
                  </div>

                  <div
                    className={`flex items-center gap-1.5 ${passwordCriteria.hasLetter ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-secondary)]'
                      }`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${passwordCriteria.hasLetter
                        ? 'bg-[#9D8F82] text-[#F3E8D6]'
                        : 'bg-[var(--border-subtle)] text-[var(--text-secondary)]'
                        }`}
                    >
                      {passwordCriteria.hasLetter ? <Check size={10} /> : '•'}
                    </span>
                    <span>At least 1 letter</span>
                  </div>

                  <div
                    className={`flex items-center gap-1.5 ${passwordCriteria.hasNumber ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-secondary)]'
                      }`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${passwordCriteria.hasNumber
                        ? 'bg-[#9D8F82] text-[#F3E8D6]'
                        : 'bg-[var(--border-subtle)] text-[var(--text-secondary)]'
                        }`}
                    >
                      {passwordCriteria.hasNumber ? <Check size={10} /> : '•'}
                    </span>
                    <span>At least 1 number</span>
                  </div>

                  <div
                    className={`flex items-center gap-1.5 ${passwordCriteria.hasSpecial ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-secondary)]'
                      }`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${passwordCriteria.hasSpecial
                        ? 'bg-[#9D8F82] text-[#F3E8D6]'
                        : 'bg-[var(--border-subtle)] text-[var(--text-secondary)]'
                        }`}
                    >
                      {passwordCriteria.hasSpecial ? <Check size={10} /> : '•'}
                    </span>
                    <span>1 special symbol</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Confirm Password */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-[var(--text-primary)]">
                  Confirm Password
                </label>
                {confirmPassword && password && (
                  <span
                    className={`text-[11px] font-bold ${confirmPassword === password
                      ? 'text-[var(--text-primary)]'
                      : 'text-rose-500'
                      }`}
                  >
                    {confirmPassword === password ? 'Passwords match' : 'Does not match'}
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  disabled={loading}
                  className="w-full pl-10 pr-11 py-2.5 text-sm rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] focus:ring-1 focus:ring-[var(--border-focus)] transition-all disabled:opacity-50"
                />
                <Lock
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !isPasswordValid || password !== confirmPassword}
              className="w-full mt-2 py-3 px-4 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] active:scale-[0.99]"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Register Account</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Link to Login */}
          <div className="mt-6 text-center text-xs text-[var(--text-secondary)]">
            <span>Already have an authorized account? </span>
            <Link
              to="/login"
              className="font-bold text-[var(--text-primary)] hover:underline ml-1"
            >
              Sign In &rarr;
            </Link>
          </div>
        </div>

        {/* Bottom micro footer */}
        <div className="mt-8 pt-4 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] flex justify-between items-center">
          <span>Enterprise Employee Registration</span>
          <span className="text-[var(--text-secondary)]">Single Portal Authentication</span>
        </div>
      </div>

      {/* Google Modal */}
      {showGoogleModal && (
        <div className="modal-backdrop">
          <div className="auth-modal">
            <button
              onClick={() => setShowGoogleModal(false)}
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
              Google Single Sign-On requires pre-authorized employee records. For initial registration,
              please use the direct registration form.
            </p>

            <button
              onClick={() => setShowGoogleModal(false)}
              className="primary-btn w-full"
            >
              Continue with Registration
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
