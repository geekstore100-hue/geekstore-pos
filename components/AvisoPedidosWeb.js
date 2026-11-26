'use client';

import { useEffect, useRef, useState } from 'react';

// Aviso de PEDIDOS DE LA TIENDA PAGADOS SIN FACTURAR (nov 2026).
// Sale arriba en todas las pantallas del POS mientras haya algún pedido de
// geekstore.com.co pagado que todavía no tenga su venta registrada (botón
// "Facturar" del admin de la tienda). Así no se despacha nada sin facturar
// y no se descuadra el inventario. Suena cuando llega uno nuevo.
// Mientras el botón de pánico está activo no se muestra ni suena.

const INTERVALO_MS = 2 * 60 * 1000;
const CLAVE_VISTOS = 'pos_pedidos_web_vistos';

const moneda = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

function sonar() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.2, 0.4].forEach((inicio, i) => {
      const osc = ctx.createOscillator();
      const gan = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 2 ? 1175 : 880;
      gan.gain.setValueAtTime(0.0001, ctx.currentTime + inicio);
      gan.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + inicio + 0.02);
      gan.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + 0.18);
      osc.connect(gan).connect(ctx.destination);
      osc.start(ctx.currentTime + inicio);
      osc.stop(ctx.currentTime + inicio + 0.2);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch {
    /* sin sonido, queda el aviso */
  }
}

function leerVistos() {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLAVE_VISTOS) || '[]'));
  } catch {
    return new Set();
  }
}

export default function AvisoPedidosWeb() {
  const [pedidos, setPedidos] = useState([]);
  const [adminUrl, setAdminUrl] = useState('https://geekstore.com.co/admin');
  const [panico, setPanico] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const panicoRef = useRef(false);

  useEffect(() => {
    function alPanico(e) {
      panicoRef.current = Boolean(e.detail?.panicoActivo);
      setPanico(panicoRef.current);
    }
    window.addEventListener('pos:pedido-distribuidor', alPanico);
    return () => window.removeEventListener('pos:pedido-distribuidor', alPanico);
  }, []);

  useEffect(() => {
    let vivo = true;
    async function consultar() {
      try {
        const r = await fetch('/api/pedidos-web/pendientes', { cache: 'no-store' });
        const d = await r.json();
        if (!vivo || !d.ok) return;
        const lista = Array.isArray(d.pedidos) ? d.pedidos : [];
        setPedidos(lista);
        if (d.adminUrl) setAdminUrl(d.adminUrl);
        // ¿Llegó alguno que este computador no había visto? Suena.
        const vistos = leerVistos();
        const nuevos = lista.filter((p) => !vistos.has(p.referencia));
        if (nuevos.length && !panicoRef.current) sonar();
        try {
          localStorage.setItem(CLAVE_VISTOS, JSON.stringify(lista.map((p) => p.referencia)));
        } catch {
          /* sin almacenamiento */
        }
      } catch {
        /* sin conexión: se intenta en la próxima vuelta */
      }
    }
    consultar();
    const t = setInterval(consultar, INTERVALO_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);

  if (!pedidos.length || panico) return null;
  const n = pedidos.length;
  return (
    <div className="pos-no-imprimir" role="alert" style={styles.caja}>
      <div style={styles.fila}>
        <span style={{ fontSize: '18px' }} aria-hidden="true">🛒</span>
        <strong style={{ flex: 1, minWidth: 0 }}>
          {n === 1 ? 'Hay 1 pedido de la tienda pagado SIN FACTURAR' : `Hay ${n} pedidos de la tienda pagados SIN FACTURAR`}
          <span style={styles.sub}> · factúralos antes de despacharlos para que no se descuadre el inventario</span>
        </strong>
        <button type="button" onClick={() => setAbierto((a) => !a)} style={styles.ver}>
          {abierto ? 'Ocultar' : 'Ver'}
        </button>
        <a href={adminUrl} target="_blank" rel="noopener noreferrer" style={styles.boton}>
          🧾 Facturar
        </a>
      </div>
      {abierto ? (
        <ul style={styles.lista}>
          {pedidos.map((p) => (
            <li key={p.referencia}>
              <b>{p.referencia}</b> · {p.cliente || 'Cliente'} · {moneda(p.total)} ·{' '}
              {new Date(p.fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' })}
              {p.error ? <span style={{ color: '#b42318' }}> · {p.error}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const styles = {
  caja: { background: '#FFF4E5', border: '1px solid #F5B66A', borderRadius: '10px', padding: '10px 14px', margin: '0 0 14px', fontSize: '14px', color: '#7A3E00' },
  fila: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  sub: { fontWeight: 400 },
  ver: { border: '1px solid #F5B66A', background: '#fff', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '13px', color: '#7A3E00' },
  boton: { background: '#D97706', color: '#fff', borderRadius: '8px', padding: '7px 12px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' },
  lista: { margin: '8px 0 0', paddingLeft: '22px', lineHeight: 1.6 },
};
