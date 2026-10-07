'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import PanicoBoton from './PanicoBoton';
import PanicoReceptor from './PanicoReceptor';
import AvisoPedidoDistribuidor from './AvisoPedidoDistribuidor';

export default function Shell({ title, children }) {
  const pathname = usePathname();
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

  // Aplica el tema visual guardado (Configuraciones > Tema visual) en
  // cualquier pantalla que use Shell, es decir, prácticamente todas.
  // Se guarda una copia en este navegador (localStorage) para no tener que
  // preguntarle a la base de datos (Neon) en cada pantalla que se abre —
  // solo se consulta la primera vez que entra alguien en ese navegador, o
  // después de que cambien el tema desde Configuraciones.
  useEffect(() => {
    let cacheado = null;
    try {
      cacheado = localStorage.getItem('temaVisual');
    } catch {
      // navegación privada u otro bloqueo: sigue de largo sin memoria local
    }

    if (cacheado === 'azul') {
      document.documentElement.setAttribute('data-tema', 'azul');
    }
    if (cacheado) return; // ya se sabe, no hace falta consultar la base de datos

    fetch('/api/tema')
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) return;
        if (d.tema === 'azul') document.documentElement.setAttribute('data-tema', 'azul');
        try {
          localStorage.setItem('temaVisual', d.tema);
        } catch {
          // sin memoria local disponible — no pasa nada, se volverá a
          // preguntar en la próxima pantalla
        }
      })
      .catch(() => {});
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
        /* Celular (octubre 2026): sin la barra lateral de iconos. En su
           lugar, arriba a la izquierda, el botón "Inicio" lleva al panel de
           botones grandes (/inicio), donde también están "Todas las
           opciones". */
        .pos-boton-inicio { display: none; }
        .pos-aviso-movil { display: none; }
        @media (max-width: 768px) {
          .pos-barra-lateral { display: none; }
          .pos-boton-inicio {
            display: inline-flex; align-items: center; gap: 6px; margin-right: 10px;
            padding: 7px 10px; border-radius: 10px; border: 1px solid var(--border);
            background: #fff; color: var(--text); font-weight: 600; font-size: 13px; text-decoration: none;
          }
          .pos-aviso-movil { display: block; }
        }
        @media (max-width: 640px) {
          .pos-topbar { padding: 0 12px; }
          .pos-topbar .pos-title { font-size: 14px; }
          .pos-topbar .pos-badge { display: none; }
          .pos-main { padding: 12px; }
        }
      `}</style>
      <div className="pos-no-imprimir pos-barra-lateral"><Sidebar /></div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header className="pos-no-imprimir pos-topbar">
          <span style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            {pathname !== '/inicio' && (
              <Link href="/inicio" className="pos-boton-inicio" aria-label="Ir al inicio">
                <span aria-hidden="true">☰</span> Inicio
              </Link>
            )}
            <span className="pos-title" style={styles.title}>{title}</span>
          </span>
          <span className="pos-badge" style={styles.badge}>Geek Store</span>
        </header>
        <main className="pos-main">
          {pathname === '/ventas' && (
            <Link href="/ventas/rapida" className="pos-aviso-movil pos-no-imprimir" style={styles.avisoMovil}>
              📱 Estás en el celular: abre la <strong>Venta rápida</strong>, hecha para vender desde aquí →
            </Link>
          )}
          {children}
        </main>
      </div>
      {/* Botón de pánico: PanicoBoton es el control remoto (solo se ve/hace
          algo en celular) y PanicoReceptor es la pantalla que se oculta
          (solo actúa en computador) — cada uno vive acá para estar
          disponible en cualquier pantalla que use Shell, sin tener que
          acordarse de agregarlos página por página. Ver ambos archivos. */}
      <PanicoBoton />
      <PanicoReceptor />
      {/* Cartel de pedido nuevo de distribuidor (usa la misma consulta de
          PanicoReceptor, ver AvisoPedidoDistribuidor.js). */}
      <AvisoPedidoDistribuidor />
    </div>
  );
}

const styles = {
  title: { fontWeight: 600, fontSize: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  avisoMovil: {
    background: 'var(--teal-light)',
    border: '1px solid var(--teal)',
    color: 'var(--teal-dark)',
    borderRadius: '10px',
    padding: '10px 12px',
    marginBottom: '12px',
    fontSize: '14px',
    textDecoration: 'none',
  },
  badge: {
    background: '#111827',
    color: '#fff',
    fontSize: '12px',
    padding: '6px 12px',
    borderRadius: '999px',
  },
};
