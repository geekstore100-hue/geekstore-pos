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
          distribuidor) — a nadie le sirve la barra lateral en el papel.
          pos-topbar/pos-main: mismos estilos de antes, pero movidos a clases
          (en vez de puro inline) para poder achicar el padding en celular
          con una media query — un style inline no se puede sobrescribir con
          @media. */}
      <style>{`
        @media print { .pos-no-imprimir { display: none !important; } }
        .pos-topbar {
          height: 56px;
          background: #fff;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          flex-shrink: 0;
        }
        .pos-main { flex: 1; padding: 24px; min-width: 0; }
        @media (max-width: 640px) {
          .pos-topbar { padding: 0 12px; }
          .pos-topbar .pos-title { font-size: 14px; }
          .pos-topbar .pos-badge { display: none; }
          .pos-main { padding: 12px; }
        }
      `}</style>
      <div className="pos-no-imprimir"><Sidebar /></div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header className="pos-no-imprimir pos-topbar">
          <span className="pos-title" style={styles.title}>{title}</span>
          <span className="pos-badge" style={styles.badge}>Geek Store</span>
        </header>
        <main className="pos-main">{children}</main>
      </div>
    </div>
  );
}

const styles = {
  title: { fontWeight: 600, fontSize: '16px' },
  badge: {
    background: '#111827',
    color: '#fff',
    fontSize: '12px',
    padding: '6px 12px',
    borderRadius: '999px',
  },
};
