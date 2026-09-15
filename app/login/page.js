'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setCargando(true);

    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clave }),
    });

    setCargando(false);

    if (res.ok) {
      router.push('/');
      router.refresh();
    } else {
      setError('Clave incorrecta');
    }
  }

  return (
    <main style={styles.main}>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.logo}>P</div>
        <h1 style={styles.title}>POS Geek Store</h1>
        <p style={styles.subtitle}>Kennedy</p>
        <input
          type="password"
          placeholder="Clave de acceso"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          style={styles.input}
          autoFocus
        />
        {error && <p style={styles.error}>{error}</p>}
        <button type="submit" disabled={cargando} style={styles.button}>
          {cargando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}

const styles = {
  main: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg)',
  },
  form: {
    background: '#fff',
    padding: '32px',
    borderRadius: '16px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
    width: '300px',
    textAlign: 'center',
  },
  logo: {
    width: '48px',
    height: '48px',
    borderRadius: '14px',
    background: 'var(--teal)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '20px',
    margin: '0 auto 16px',
  },
  title: { margin: 0, fontSize: '18px' },
  subtitle: { marginTop: '4px', marginBottom: '20px', color: 'var(--text-secondary)' },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '15px',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    marginBottom: '12px',
    boxSizing: 'border-box',
  },
  button: {
    width: '100%',
    padding: '11px',
    fontSize: '15px',
    borderRadius: '10px',
    border: 'none',
    background: 'var(--teal)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
  },
  error: { color: 'var(--danger)', fontSize: '13px', marginBottom: '12px' },
};
