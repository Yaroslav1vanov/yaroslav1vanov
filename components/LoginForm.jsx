'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    const t = localStorage.getItem('ela_theme') || 'dark';
    setTheme(t);
    document.documentElement.dataset.theme = t;
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('ela_theme', next);
  }

  async function handleLogin(e) {
    e?.preventDefault();
    if (!email || !pass) { setError('Введите email и пароль'); return; }
    setLoading(true); setError('');
    const sb = createClient();
    const { error: err } = await sb.auth.signInWithPassword({ email, password: pass });
    if (err) {
      setError(err.message === 'Invalid login credentials' ? 'Неверный email или пароль' : err.message);
      setLoading(false);
    } else {
     window.location.href = '/dashboard';
    }
  }

  return (
    <div style={styles.page}>
      <button onClick={toggleTheme} style={styles.themeBtn}>{theme === 'dark' ? '🌙' : '☀️'}</button>
      <div style={styles.card}>
        <div style={styles.logo}>
          <div style={styles.logoMark}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="white" strokeWidth="1.4"/>
              <path d="M5 8.5L7 10.5L11 6" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={styles.logoText}>Easy<span style={styles.grad}>Life AI</span></span>
        </div>

        <h1 style={styles.title}>Добро пожаловать</h1>
        <p style={styles.sub}>Войдите в CRM-систему EasyLife AI</p>

        <form onSubmit={handleLogin}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoComplete="email"
              style={styles.input}
              className="ela-input"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Пароль</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                value={pass}
                onChange={e => setPass(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{ ...styles.input, paddingRight: '48px' }}
                className="ela-input"
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                style={styles.eyeBtn}
              >{showPass ? '🙈' : '👁'}</button>
            </div>
          </div>

          {error && <div style={styles.errBox}>{error}</div>}

          <button
            type="submit"
            disabled={loading}
            style={{ ...styles.btn, opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Вхожу...' : 'Войти'}
          </button>
        </form>

        <p style={styles.hint}>
          После первого входа как администратор<br />
          создайте аккаунты сотрудников через раздел 🔐
        </p>
      </div>

      <style>{`
        .ela-input {
          width: 100%;
          background: var(--card2, #0D1429);
          border: 1px solid var(--bdr, rgba(0,229,255,0.1));
          border-radius: 10px;
          padding: 12px 14px;
          color: var(--t1, #D6E8F5);
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          outline: none;
          transition: border-color .15s;
        }
        .ela-input:focus { border-color: var(--cy, #00E5FF); }
      `}</style>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: '20px', position: 'relative',
    background: 'var(--bg)',
  },
  themeBtn: {
    position: 'fixed', top: '16px', right: '16px',
    background: 'var(--card)', border: '1px solid var(--bdr)',
    borderRadius: '8px', padding: '6px 10px', fontSize: '16px',
    cursor: 'pointer', color: 'var(--t1)',
  },
  card: {
    background: 'var(--card)', border: '1px solid var(--bdr2)',
    borderRadius: '20px', padding: '40px', width: '100%', maxWidth: '400px',
    boxShadow: '0 24px 80px rgba(0,180,200,.08)',
  },
  logo: {
    display: 'flex', alignItems: 'center', gap: '10px',
    fontFamily: "'Exo 2', sans-serif", fontWeight: 900, fontSize: '20px',
    marginBottom: '32px', justifyContent: 'center', color: 'var(--t1)',
  },
  logoMark: {
    width: '36px', height: '36px', borderRadius: '10px',
    background: 'linear-gradient(135deg, #00E5FF, #7C3AED)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  logoText: { fontFamily: "'Exo 2', sans-serif", fontWeight: 900 },
  grad: {
    background: 'linear-gradient(90deg, #00E5FF, #A855F7)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  title: {
    fontFamily: "'Exo 2', sans-serif", fontSize: '24px', fontWeight: 800,
    textAlign: 'center', marginBottom: '6px', color: 'var(--t1)',
  },
  sub: { fontSize: '13px', color: 'var(--t2)', textAlign: 'center', marginBottom: '28px' },
  field: { marginBottom: '16px' },
  label: {
    fontSize: '9px', fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '.9px', color: 'var(--t2)', display: 'block', marginBottom: '5px',
  },
  eyeBtn: {
    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px',
    lineHeight: 1, padding: '4px', color: 'var(--t2)',
  },
  errBox: {
    background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)',
    borderRadius: '8px', padding: '10px 13px', fontSize: '12px',
    color: '#EF4444', marginBottom: '12px',
  },
  btn: {
    width: '100%',
    background: 'linear-gradient(135deg, #00B8CC, #007A8A)',
    color: '#021218', border: 'none', borderRadius: '10px',
    padding: '13px', fontSize: '14px', fontWeight: 700,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", marginTop: '4px',
  },
  hint: {
    fontSize: '10px', color: 'var(--t3)', textAlign: 'center',
    marginTop: '20px', lineHeight: 1.6,
  },
};
