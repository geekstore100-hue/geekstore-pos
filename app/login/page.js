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
    fontFamily: 'sans-serif',
    background: '#f4f4f5',
  },
  form: {
    background: '#fff',
    padding: '32px',
    borderRadius: '12px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
    width: '280px',
    textAlign: 'center',
  },
  title: { margin: 0, fontSize: '20px' },
  subtitle: { marginTop: '4px', marginBottom: '20px', color: '#666' },
  input: {
    width: '100%',
    padding: '10px',
    fontSize: '16px',
    borderRadius: '8px',
    border: '1px solid #ccc',
    marginBottom: '12px',
    boxSizing: 'border-box',
  },
  button: {
    width: '100%',
    padding: '10px',
    fontSize: '16px',
    borderRadius: '8px',
    border: 'none',
    background: '#111',
    color: '#fff',
    cursor: 'pointer',
  },
  error: { color: '#c00', fontSize: '14px', marginBottom: '12px' },
};
