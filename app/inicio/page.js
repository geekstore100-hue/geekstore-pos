'use client';

import { useState } from 'react';
import Link from 'next/link';
import Shell from '../../components/Shell';
import { links } from '../../components/Sidebar';

// Panel de inicio para el CELULAR (octubre 2026): botones grandes en vez
// de la barra lateral de iconos (que en el celular ya no se muestra; ver
// components/Shell.js). "Todas las opciones" despliega el menú completo,
// el mismo de la barra lateral del computador.

const PRINCIPALES = [
  { href: '/ventas/rapida', label: 'Ventas', emoji: '🛒', color: '#00c2a8' },
  { href: '/ajustes-inventario', label: 'Ajustes de inventario', emoji: '📦', color: '#6366f1' },
  { href: '/reabastecimiento', label: 'Reabastecimiento', emoji: '🔄', color: '#f59e0b' },
  { href: '/lista-compras', label: 'Lista de compras', emoji: '📝', color: '#ec4899' },
  { href: '/reteica', label: 'Certificados ReteICA', emoji: '🧾', color: '#0ea5e9' },
  { href: '/analiticas', label: 'Analíticas', emoji: '📈', color: '#22c55e' },
  { href: '/cupones', label: 'Cupones', emoji: '🎟️', color: '#ef4444' },
  { href: '/eventos', label: 'Ventas de eventos', emoji: '📊', color: '#8b5cf6' },
];

export default function InicioPage() {
  const [todas, setTodas] = useState(false);

  return (
    <Shell title="Inicio">
      <style>{`
        .ini { max-width: 640px; margin: 0 auto; }
        .ini-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .ini-boton {
          display: flex; flex-direction: column; justify-content: space-between; gap: 18px;
          min-height: 118px; padding: 16px; border-radius: 16px; background: #fff;
          border: 1px solid var(--border); text-decoration: none; color: var(--text);
          box-shadow: 0 1px 2px rgba(0,0,0,.04); -webkit-tap-highlight-color: transparent;
        }
        .ini-boton:active { transform: scale(.98); }
        .ini-emoji { width: 46px; height: 46px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; }
        .ini-texto { font-weight: 700; font-size: 16px; line-height: 1.2; }
        .ini-todas { grid-column: 1 / -1; min-height: 0; flex-direction: row; align-items: center; justify-content: flex-start; gap: 12px; padding: 14px 16px; width: 100%; font: inherit; cursor: pointer; text-align: left; }
        .ini-lista { background: #fff; border: 1px solid var(--border); border-radius: 16px; margin-top: 12px; overflow: hidden; }
        .ini-lista a { display: flex; align-items: center; gap: 12px; padding: 13px 16px; color: var(--text); text-decoration: none; border-bottom: 1px solid var(--border); font-size: 15px; }
        .ini-grupo { padding: 12px 16px 4px; font-size: 12px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .04em; }
        .ini-lista svg { color: var(--text-secondary); flex: none; }
      `}</style>
      <div className="ini">
        <div className="ini-grid">
          {PRINCIPALES.map((b) => (
            <Link key={b.href} href={b.href} className="ini-boton">
              <span className="ini-emoji" style={{ background: `${b.color}1f` }}>{b.emoji}</span>
              <span className="ini-texto">{b.label}</span>
            </Link>
          ))}
          <button type="button" className="ini-boton ini-todas" onClick={() => setTodas((t) => !t)} aria-expanded={todas}>
            <span className="ini-emoji" style={{ background: '#11182714' }}>☰</span>
            <span className="ini-texto" style={{ flex: 1 }}>Todas las opciones</span>
            <span style={{ fontSize: '20px', color: 'var(--text-secondary)' }}>{todas ? '−' : '+'}</span>
          </button>
        </div>

        {todas && (
          <div className="ini-lista">
            {links.map((item) => {
              const Icon = item.icon;
              if (item.children) {
                return (
                  <div key={item.href}>
                    <div className="ini-grupo">{item.label}</div>
                    {item.children.map((c) => {
                      const CIcon = c.icon;
                      return (
                        <Link key={c.href} href={c.href}>
                          <CIcon />
                          <span>{c.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                );
              }
              return (
                <Link key={item.href} href={item.href}>
                  <Icon />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <a href="/api/logout" style={{ color: 'var(--danger)' }}>Cerrar sesión</a>
          </div>
        )}
      </div>
    </Shell>
  );
}
