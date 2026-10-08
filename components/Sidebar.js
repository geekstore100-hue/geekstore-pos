'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

// Exportado también para el panel de inicio del celular (app/inicio), que
// muestra "Todas las opciones" con esta misma lista.
export const links = [
  { href: '/ventas', label: 'Vender', icon: IconCart },
  // Venta rápida (octubre 2026): pantalla para el celular y para eventos
  // como SOFA (ventas por fuera del turno, eligiendo la bodega).
  { href: '/ventas/rapida', label: 'Venta rápida / eventos', icon: IconCelular },
  // Cupones (octubre 2026): canjear y ver la campaña (SOFA 2026).
  { href: '/cupones', label: 'Cupones', icon: IconTag },
  {
    href: '/productos',
    label: 'Inventario',
    icon: IconBox,
    children: [
      {
        href: '/productos',
        label: 'Productos',
        icon: IconBox,
        // En vez de una fila aparte "Nuevo producto" (como estaba antes),
        // el "+" queda al final de esta misma fila — así se ve igual que
        // en Alegra (Nelson mandó una captura de referencia).
        agregarHref: '/productos?nuevo=1',
        agregarTitulo: 'Nuevo producto',
      },
      { href: '/productos/fichas', label: 'Fichas incompletas', icon: IconChequeo },
      { href: '/ajustes-inventario', label: 'Ajustes de inventario', icon: IconAdjust },
      { href: '/etiquetas', label: 'Etiquetas', icon: IconTag },
      { href: '/chequeos-inventario', label: 'Chequeo semanal', icon: IconChequeo },
    ],
  },
  { href: '/reabastecimiento', label: 'Reabastecimiento', icon: IconReabastecer },
  { href: '/lista-compras', label: 'Lista de compras', icon: IconListaCompras },
  {
    href: '/cotizaciones-distribuidor',
    label: 'Distribuidores',
    icon: IconTruck,
    children: [
      { href: '/cotizaciones-distribuidor', label: 'Pedidos', icon: IconInbox },
      { href: '/distribuidores', label: 'Administrar', icon: IconTruck },
    ],
  },
  {
    href: '/historial',
    label: 'Historial',
    icon: IconHistorial,
    children: [
      { href: '/historial', label: 'Ventas', icon: IconHistorial },
      { href: '/turnos', label: 'Turnos', icon: IconTurno },
      { href: '/eventos', label: 'Ventas de eventos', icon: IconHistorial },
    ],
  },
  { href: '/devoluciones', label: 'Devoluciones', icon: IconDevolucion },
  {
    href: '/gastos/facturas-compra',
    label: 'Gastos',
    icon: IconGastos,
    // Por ahora solo tiene una subcategoría (Nelson la pidió así, dejando
    // espacio para que más adelante entren otros tipos de gasto aparte de
    // facturas de compra).
    children: [{ href: '/gastos/facturas-compra', label: 'Factura de compra', icon: IconGastos }],
  },
  { href: '/garantias-proveedor', label: 'Garantías a proveedor', icon: IconGarantia },
  { href: '/reteica', label: 'Certificados ReteICA', icon: IconCertificado },
  { href: '/manifiestos', label: 'Manifiestos de importación', icon: IconManifiesto },
  { href: '/reportes', label: 'Reportes', icon: IconChart },
  { href: '/analiticas', label: 'Analíticas', icon: IconAnaliticas },
  { href: '/configuraciones', label: 'Configuraciones', icon: IconSettings },
];

function esActivo(pathname, item) {
  if (item.children) return item.children.some((c) => pathname === c.href);
  return pathname === item.href;
}

export default function Sidebar() {
  const pathname = usePathname();
  const [expandido, setExpandido] = useState(false);

  // Antes, al abrir el menú lateral, TODAS las subcategorías de TODOS los
  // grupos (Inventario, Distribuidores, Historial, Gastos) aparecían
  // desplegadas de una vez, así que el menú quedaba larguísimo y era difícil
  // encontrar la categoría principal que se buscaba. Ahora arrancan
  // plegadas — solo se ven los nombres de las categorías principales, con un
  // "+" al lado — y cada una se despliega por separado al tocarla. La
  // categoría del grupo donde ya se está parado arranca abierta, para no
  // esconder de una vez la página activa.
  const [gruposAbiertos, setGruposAbiertos] = useState(() => {
    const grupoActivo = links.find((item) => item.children && esActivo(pathname, item));
    return new Set(grupoActivo ? [grupoActivo.href] : []);
  });

  function alternarGrupo(e, href) {
    // Sin esto, en celular (donde el toque abre/cierra todo el menú, ver
    // alternarPorToque más abajo) tocar el "+" de un grupo cerraría de
    // inmediato el menú completo en vez de solo desplegar ese grupo.
    e.stopPropagation();
    setGruposAbiertos((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(href)) siguiente.delete(href);
      else siguiente.add(href);
      return siguiente;
    });
  }

  // En celular no existe el "hover" (mouseenter/mouseleave nunca disparan al
  // tocar con el dedo), así que antes el menú expandido era imposible de
  // abrir ahí — solo se veían los iconos, sin los nombres, y sin forma de
  // saber cuál era cuál. matchMedia('(hover: none)') detecta ese caso y deja
  // que el toque abra/cierre el menú; en un mouse normal esto no hace nada
  // (el hover ya se encarga), así que no cambia el comportamiento de
  // escritorio.
  function alternarPorToque() {
    if (typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches) {
      setExpandido((actual) => !actual);
    }
  }

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setExpandido(true)}
      onMouseLeave={() => setExpandido(false)}
      onClick={alternarPorToque}
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
              const abierto = gruposAbiertos.has(item.href);
              return (
                <div key={item.href} style={{ marginBottom: '4px' }}>
                  <div
                    onClick={(e) => alternarGrupo(e, item.href)}
                    style={{ ...styles.flyoutGrupoTitulo, ...(activo ? styles.flyoutLinkActivo : {}) }}
                  >
                    <Icon />
                    <span style={{ flex: 1 }}>{item.label}</span>
                    <span style={styles.flyoutToggle}>{abierto ? '−' : '+'}</span>
                  </div>
                  {abierto && (
                    <div style={styles.flyoutSubgrupo}>
                      {item.children.map((child) => {
                        const childActivo = pathname === child.href;
                        const ChildIcon = child.icon;

                        // Fila con un "+" al final (por ahora solo
                        // "Productos", ver arriba) en vez de una fila aparte
                        // — mismo estilo que el POS de Alegra.
                        if (child.agregarHref) {
                          return (
                            <div key={child.href} style={{ display: 'flex', alignItems: 'stretch' }}>
                              <Link
                                href={child.href}
                                style={{
                                  ...styles.flyoutLink,
                                  ...styles.flyoutLinkHijo,
                                  ...(childActivo ? styles.flyoutLinkActivo : {}),
                                  flex: 1,
                                }}
                              >
                                <ChildIcon />
                                <span>{child.label}</span>
                              </Link>
                              <Link href={child.agregarHref} title={child.agregarTitulo} style={styles.flyoutBotonAgregar}>
                                <IconMas />
                              </Link>
                            </div>
                          );
                        }

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
                  )}
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
    cursor: 'pointer',
    userSelect: 'none',
  },
  flyoutToggle: {
    width: '18px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '5px',
    background: 'var(--bg)',
    fontSize: '14px',
    fontWeight: 700,
    flexShrink: 0,
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
  flyoutBotonAgregar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    flexShrink: 0,
    color: 'var(--teal)',
    textDecoration: 'none',
    borderRadius: '8px',
  },
};

function IconCelular() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <path d="M11 18h2" />
    </svg>
  );
}

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
function IconTruck() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="1" y="7" width="13" height="10" rx="1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 10h4l3 3v4h-7z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6" cy="19" r="1.7" />
      <circle cx="17.5" cy="19" r="1.7" />
    </svg>
  );
}
function IconTag() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20.59 13.41L11 3.83A2 2 0 009.59 3.24L3 3v6.59a2 2 0 00.59 1.41l9.59 9.59a2 2 0 002.82 0l4.59-4.59a2 2 0 000-2.82z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconChequeo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="4" width="14" height="17" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 4V3h6v1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconGarantia() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconManifiesto() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="11" cy="15" r="3" />
      <path d="M13.2 17.2L16 20" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconMas() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconCertificado() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="3" width="16" height="18" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 8h8M8 12h8M8 16h4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="17" cy="17" r="4" />
      <path d="M17 15.5v3M15.5 17h3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconListaCompras() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 2l1.5 4M18 2l-1.5 4M4 6h16l-1.5 10a2 2 0 01-2 1.7H7.5a2 2 0 01-2-1.7L4 6z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="21" r="1.3" />
      <circle cx="16" cy="21" r="1.3" />
    </svg>
  );
}
function IconAnaliticas() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19V5M4 19h16" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 15l3-4 3 2 4-6" strokeLinecap="round" strokeLinejoin="round" />
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
