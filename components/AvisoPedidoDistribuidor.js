'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Cartel de "Nuevo pedido de distribuidor" en el computador de la tienda.
//
// No hace consultas propias: PanicoReceptor ya pregunta cada pocos segundos
// el estado del pánico, y esa respuesta trae también el último pedido de
// distribuidor (ver lib/avisoPedidoDistribuidor.js). Aquí solo se escucha
// ese dato y se muestra el cartel si es un pedido que todavía no se ha visto
// en ESTE computador (se recuerda en el navegador).
//
// El cartel suena una vez, hace titilar el título de la pestaña y queda a
// la vista hasta que se abra el pedido o se cierre. Si se entra a
// Distribuidores > Pedidos, se da por visto solo.
//
// Mientras el pánico está activo no suena ni cambia el título de la
// pestaña (la pantalla tiene que parecer un "Cargando..." cualquiera).

const CLAVE_VISTO = 'pos_pedido_dist_visto';
const MAX_ANTIGUEDAD_MS = 3 * 24 * 60 * 60 * 1000; // en un computador nuevo, no avisar pedidos de hace días

function leerVisto() {
  try {
    return localStorage.getItem(CLAVE_VISTO) || '';
  } catch {
    return '';
  }
}

function guardarVisto(creadoEn) {
  try {
    localStorage.setItem(CLAVE_VISTO, creadoEn);
  } catch {
    // sin almacenamiento: el cartel simplemente se cierra por ahora
  }
}

function sonar() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.22, 0.44].forEach((inicio, i) => {
      const osc = ctx.createOscillator();
      const gan = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 2 ? 1046 : 784;
      gan.gain.setValueAtTime(0.0001, ctx.currentTime + inicio);
      gan.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + inicio + 0.02);
      gan.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + 0.2);
      osc.connect(gan).connect(ctx.destination);
      osc.start(ctx.currentTime + inicio);
      osc.stop(ctx.currentTime + inicio + 0.22);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch {
    // si el navegador bloquea el sonido, igual queda el cartel
  }
}

const moneda = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

export default function AvisoPedidoDistribuidor() {
  const pathname = usePathname() || '';
  const [pedido, setPedido] = useState(null);
  const ultimoSonadoRef = useRef('');
  const panicoRef = useRef(false);
  const enPedidos = pathname.startsWith('/cotizaciones-distribuidor');

  function marcarVisto(p = pedido) {
    if (p?.creadoEn) guardarVisto(p.creadoEn);
    setPedido(null);
  }

  useEffect(() => {
    function alLlegar(e) {
      const p = e.detail?.pedido;
      panicoRef.current = Boolean(e.detail?.panicoActivo);
      if (!p?.creadoEn) return;
      const visto = leerVisto();
      if (!visto) {
        // Primera vez en este computador: solo se avisa si el pedido es reciente.
        if (Date.now() - new Date(p.creadoEn).getTime() > MAX_ANTIGUEDAD_MS) {
          guardarVisto(p.creadoEn);
          return;
        }
      } else if (p.creadoEn <= visto) {
        return;
      }
      if (window.location.pathname.startsWith('/cotizaciones-distribuidor')) {
        guardarVisto(p.creadoEn);
        return;
      }
      setPedido(p);
      if (ultimoSonadoRef.current !== p.creadoEn && !panicoRef.current) {
        ultimoSonadoRef.current = p.creadoEn;
        sonar();
      }
    }
    window.addEventListener('pos:pedido-distribuidor', alLlegar);
    return () => window.removeEventListener('pos:pedido-distribuidor', alLlegar);
  }, []);

  // Si se entra a Distribuidores > Pedidos, el aviso se da por visto.
  useEffect(() => {
    if (enPedidos && pedido) marcarVisto(pedido);
  }, [enPedidos, pedido]);

  // Título de la pestaña titilando mientras el cartel esté abierto (para
  // notarlo aunque se esté en otra pestaña del navegador).
  useEffect(() => {
    if (!pedido) return;
    const original = document.title;
    let alterno = false;
    const intervalo = setInterval(() => {
      if (panicoRef.current) {
        document.title = original;
        return;
      }
      alterno = !alterno;
      document.title = alterno ? '🔔 Nuevo pedido de distribuidor' : original;
    }, 1200);
    return () => {
      clearInterval(intervalo);
      document.title = original;
    };
  }, [pedido]);

  if (!pedido) return null;

  return (
    <div className="pos-no-imprimir" role="alert" style={styles.cartel}>
      <div style={styles.encabezado}>
        <span style={styles.icono} aria-hidden="true">🔔</span>
        <strong>Nuevo pedido de distribuidor</strong>
        <button type="button" onClick={() => marcarVisto()} style={styles.cerrar} aria-label="Cerrar aviso">×</button>
      </div>
      <div style={styles.cuerpo}>
        <div style={{ fontWeight: 600 }}>{pedido.distribuidor || 'Distribuidor'}</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
          {pedido.articulos} artículo{pedido.articulos === 1 ? '' : 's'} · {moneda(pedido.total)}
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
          {new Date(pedido.creadoEn).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' })}
        </div>
      </div>
      <Link
        href={pedido.id ? `/cotizaciones-distribuidor/${pedido.id}` : '/cotizaciones-distribuidor'}
        onClick={() => marcarVisto()}
        style={styles.boton}
      >
        Ver pedido
      </Link>
    </div>
  );
}

const styles = {
  cartel: {
    position: 'fixed',
    right: '20px',
    bottom: '20px',
    width: '300px',
    maxWidth: 'calc(100vw - 40px)',
    background: '#fff',
    border: '2px solid var(--teal)',
    borderRadius: '12px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
    padding: '14px 16px',
    zIndex: 1000,
    fontSize: '14px',
  },
  encabezado: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--teal-dark)' },
  icono: { fontSize: '18px' },
  cerrar: { marginLeft: 'auto', border: 'none', background: 'none', fontSize: '20px', lineHeight: 1, cursor: 'pointer', color: 'var(--text-secondary)' },
  cuerpo: { marginBottom: '12px' },
  boton: {
    display: 'block',
    textAlign: 'center',
    padding: '9px 12px',
    borderRadius: '8px',
    background: 'var(--teal)',
    color: '#fff',
    fontWeight: 600,
    textDecoration: 'none',
  },
};
