'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const links = [
  { href: '/ventas', label: 'Vender', icon: IconCart },
  {
    href: '/productos',
    label: 'Inventario',
    icon: IconBox,
    children: [
      { href: '/productos', label: 'Productos', icon: IconBox },
      { href: '/ajustes-inventario', label: 'Ajustes de inventario', icon: IconAdjust },
    ],
  },
  { href: '/entradas', label: 'Compras', icon: IconInbox },
  { href: '/reabastecimiento', label: 'Reabastecimiento', icon: IconReabastecer },
  {
    href: '/historial',
    label: 'Historial',
    icon: IconHistorial,
    children: [
      { href: '/historial', label: 'Ventas', icon: IconHistorial },
      { href: '/turnos', label: 'Turnos', icon: IconTurno },
    ],
  },
  { href: '/devoluciones', label: 'Devoluciones', icon: IconDevolucion },
  {
    href: '/gastos/facturas-compra',
    label: 'Gastos',
    icon: IconGastos,
    children: [
      { href: '/gastos/facturas-compra', label: 'Facturas de compra', icon: IconGastos },
    ],
  },
  { href: '/reportes', label: 'Reportes', icon: IconChart },
  { href: '/configuraciones', label: 'Configuraciones', icon: IconSettings },
];

function esActivo(pathname, item) {
  if (item.children) return item.children.some((c) => pathname === c.href);
  return pathname === item.href;
}

export default function Sidebar() {
  const pathname = usePathname();
  const [expandido, setExpandido] = useState(false);

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setExpandido(true)}
      onMouseLeave={() => setExpandido(false)}
    >
      <nav style={styles.nav}>
        <div style={styles.logo}>P</div>
        {links.map((item) => {
          const activo = esActivo(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{ ...styles.link, ...(activo ? styles.linkActivo : {}) }}
              title={item.label}
            >
              <Icon />
            </Link>
          );
        })}
        <a href="/api/logout" style={{ ...styles.link, marginTop: 'auto', marginBottom: '16px' }} title="Cerrar sesión">
          <IconLogout />
        </a>
      </nav>

      {expandido && (
        <div style={styles.flyout}>
          <div style={styles.flyoutTitulo}>POS Geek Store</div>
          {links.map((item) => {
            const activo = esActivo(pathname, item);
            const Icon = item.icon;

            if (item.children) {
              return (
                <div key={item.href} style={{ marginBottom: '4px' }}>
                  <div style={{ ...styles.flyoutGrupoTitulo, ...(activo ? styles.flyoutLinkActivo : {}) }}>
                    <Icon />
                    <span>{item.label}</span>
                  </div>
                  <div style={styles.flyoutSubgrupo}>
                    {item.children.map((child) => {
                      const childActivo = pathname === child.href;
                      const ChildIcon = child.icon;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          style={{ ...styles.flyoutLink, ...styles.flyoutLinkHijo, ...(childActivo ? styles.flyoutLinkActivo : {}) }}
                        >
                          <ChildIcon />
                          <span>{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                style={{ ...styles.flyoutLink, ...(activo ? styles.flyoutLinkActivo : {}) }}
              >
                <Icon />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <a href="/api/logout" style={{ ...styles.flyoutLink, marginTop: 'auto' }}>
            <IconLogout />
            <span>Cerrar sesión</span>
          </a>
        </div>
      )}
    </div>
  );
}

const styles = {
  nav: {
    width: '64px',
    background: '#fff',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: '16px',
    gap: '8px',
    minHeight: '100vh',
  },
  logo: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    background: 'var(--teal)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    marginBottom: '16px',
  },
  link: {
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '10px',
    color: '#6b7280',
  },
  linkActivo: {
    background: 'var(--teal-light)',
    color: 'var(--teal-dark)',
  },
  flyout: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '220px',
    minHeight: '100vh',
    background: '#fff',
    borderRight: '1px solid var(--border)',
    boxShadow: '4px 0 20px rgba(0,0,0,0.12)',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 12px',
    gap: '4px',
    zIndex: 200,
  },
  flyoutTitulo: {
    fontWeight: 700,
    fontSize: '14px',
    padding: '0 12px',
    marginBottom: '16px',
    color: 'var(--text)',
  },
  flyoutLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderRadius: '8px',
    color: '#6b7280',
    textDecoration: 'none',
    fontSize: '14px',
  },
  flyoutLinkActivo: {
    background: 'var(--teal-light)',
    color: 'var(--teal-dark)',
    fontWeight: 600,
  },
  flyoutGrupoTitulo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderRadius: '8px',
    color: '#6b7280',
    fontSize: '14px',
  },
  flyoutSubgrupo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    marginLeft: '16px',
    borderLeft: '1px solid var(--border)',
    paddingLeft: '8px',
  },
  flyoutLinkHijo: {
    fontSize: '13px',
    padding: '8px 12px',
  },
};

function IconHome() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 11l9-8 9 8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v10h14V10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconBox() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 8l-9-5-9 5 9 5 9-5z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 8v8l9 5 9-5V8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 13v8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconCart() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M2 3h2l2.4 12.2a2 2 0 002 1.8h8.6a2 2 0 002-1.6L21 7H6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconInbox() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12h4l2 3h6l2-3h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 12L3 5h18l-2 7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 12v6a1 1 0 001 1h16a1 1 0 001-1v-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 20V10M12 20V4M20 20v-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconHistorial() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconAdjust() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h13M21 18h-1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="19" cy="18" r="2" />
    </svg>
  );
}
function IconTurno() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 10h18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 2v4M16 2v4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconReabastecer() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 10-2.6 6.36" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 4v6h-6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8v4l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconDevolucion() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 10h11a5 5 0 010 10h-2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 6L3 10l4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconGastos() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="6" width="18" height="13" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 10h18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 14.5h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 3v4M8 3v4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconLogout() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
