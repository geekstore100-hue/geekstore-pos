'use client';

import { useEffect } from 'react';
import Sidebar from './Sidebar';

export default function Shell({ title, children }) {
  // Evita el problema clásico de los navegadores: si el mouse queda sobre un
  // <input type="number"> y la persona hace scroll con la rueda del mouse
  // para bajar la página, el navegador cambia el número en vez de scrollear.
  // Esto le quita el foco al campo apenas detecta scroll, así el valor nunca
  // cambia solo. Puesto acá (en Shell, que envuelve casi todas las
  // pantallas) para que aplique a CUALQUIER campo numérico de todo el
  // sistema, sin tener que acordarse de agregarlo en cada pantalla nueva.
  useEffect(() => {
    function evitarScrollEnNumeros() {
      const el = document.activeElement;
      if (el && el.tagName === 'INPUT' && el.type === 'number') {
        el.blur();
      }
    }
    document.addEventListener('wheel', evitarScrollEnNumeros, { passive: true });
    return () => document.removeEventListener('wheel', evitarScrollEnNumeros);
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* pos-no-imprimir: se oculta al imprimir (ver cotizaciones de
          distribuidor) — a nadie le sirve la barra lateral en el papel. */}
      <style>{'@media print { .pos-no-imprimir { display: none !important; } }'}</style>
      <div className="pos-no-imprimir"><Sidebar /></div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header className="pos-no-imprimir" style={styles.topbar}>
          <span style={styles.title}>{title}</span>
          <span style={styles.badge}>Geek Store</span>
        </header>
        <main style={styles.main}>{children}</main>
      </div>
    </div>
  );
}

const styles = {
  topbar: {
    height: '56px',
    background: '#fff',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    flexShrink: 0,
  },
  title: { fontWeight: 600, fontSize: '16px' },
  badge: {
    background: '#111827',
    color: '#fff',
    fontSize: '12px',
    padding: '6px 12px',
    borderRadius: '999px',
  },
  main: { flex: 1, padding: '24px', minWidth: 0 },
};
