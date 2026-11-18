import { useState } from 'react';
import { ArrowUpRight, ShieldCheck, X } from 'lucide-react';

export function AuthModal({ onClose }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    // Authentication will be wired to the Express backend in Phase 2.
    setMessage(
      mode === 'login'
        ? 'Backend authentication will be connected in Phase 2.'
        : 'Registration will be available in Phase 2.'
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="modal-icon">
          <ShieldCheck size={21} />
        </div>
        <p className="eyebrow">Secure workspace</p>
        <h3>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h3>
        <p className="modal-subtitle">Use your Crew account to sync attendance, leave and tasks.</p>

        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </label>
          <button className="primary-btn full" type="submit">
            {mode === 'login' ? 'Sign in' : 'Create account'} <ArrowUpRight size={16} />
          </button>
        </form>

        {message && <div className="form-message">{message}</div>}

        <button
          className="text-btn"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setMessage('');
          }}
        >
          {mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
