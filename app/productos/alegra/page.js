'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '../../../components/Shell';

// Productos → "Pendientes en Alegra" (octubre 2026).
//
// Lista los productos creados en el POS que todavía no están en Alegra
// (la cuenta de la facturación electrónica). Sin eso, los pedidos de la
// tienda con esos productos no se pueden facturar.
//
// 1. "Revisar en Alegra": busca cada uno por su referencia; los que ya
//    estaban allá se enlazan solos y salen de la lista.
// 2. A los que faltan se les elige Con IVA / Sin IVA y se crean.

function moneda(n) {
  return n ? `$${Number(n).toLocaleString('es-CO')}` : '—';
}

export default function PendientesAlegraPage() {
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [iva, setIva] = useState({}); // id → true | false
  const [estado, setEstado] = useState({}); // id → { tipo: 'ok'|'error'|'trabajando'|'falta', texto }
  const [trabajando, setTrabajando] = useState(false);
  const [revisado, setRevisado] = useState(false);
  // Venta en negativo (oct 2026)
  const [enlazados, setEnlazados] = useState(null);
  const [negEstado, setNegEstado] = useState({}); // id → { tipo, texto }
  const [negTrabajando, setNegTrabajando] = useState(false);
  const [negDetener, setNegDetener] = useState(false);

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const res = await fetch('/api/productos/alegra-pendientes');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo cargar');
      setProductos(data.productos || []);
    } catch (e) {
      setError(e.message);
    }
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function cargarEnlazados() {
    try {
      const res = await fetch('/api/productos/alegra-venta-negativa');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo cargar');
      setEnlazados(data.productos || []);
    } catch (e) {
      setError(e.message);
    }
  }

  const TEXTO_NEG = {
    activada: '✅ Activada',
    'ya-estaba': '✅ Ya estaba activada',
    'sin-confirmar': '🟡 Enviada (Alegra no confirma el dato: revisa uno en Alegra)',
    'no-aplica': '— No aplica',
    'no-se-pudo': '⚠️ Alegra la sigue mostrando apagada',
  };

  async function activarNegativa(p) {
    setNegEstado((s) => ({ ...s, [p.id]: { tipo: 'trabajando', texto: 'Trabajando…' } }));
    try {
      const res = await fetch('/api/productos/alegra-venta-negativa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productoId: p.id }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error');
      const tipo = ['activada', 'ya-estaba', 'no-aplica'].includes(data.estado) ? 'ok' : data.estado === 'sin-confirmar' ? 'falta' : 'error';
      setNegEstado((s) => ({ ...s, [p.id]: { tipo, texto: `${TEXTO_NEG[data.estado] || data.estado}${data.motivo && tipo !== 'falta' ? ` (${data.motivo})` : ''}` } }));
      return tipo;
    } catch (e) {
      setNegEstado((s) => ({ ...s, [p.id]: { tipo: 'error', texto: e.message } }));
      return /ALEGRA2_EMAIL/.test(e.message) ? 'sin-claves' : 'error';
    }
  }

  async function activarTodas(lista) {
    setNegTrabajando(true);
    setNegDetener(false);
    window.__detenerNeg = false;
    for (const p of lista) {
      if (window.__detenerNeg) break;
      if (negEstado[p.id]?.tipo === 'ok') continue;
      const r = await activarNegativa(p);
      if (r === 'sin-claves') break;
    }
    setNegTrabajando(false);
  }

  async function enviar(p, conIva) {
    setEstado((s) => ({ ...s, [p.id]: { tipo: 'trabajando', texto: 'Trabajando…' } }));
    try {
      const res = await fetch(`/api/productos/${p.id}/alegra`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conIva === undefined ? {} : { conIva }),
      });
      const data = await res.json();
      if (data.ok) {
        const neg = data.negativo;
        const avisoNeg = neg && ['no-se-pudo', 'error'].includes(neg.estado) ? ` ⚠️ Venta en negativo: ${neg.motivo || 'no se pudo activar'}` : '';
        const texto =
          (data.estado === 'creado'
            ? `✅ Creado en Alegra${data.fotoError ? ` (la foto no subió: ${data.fotoError})` : ''}`
            : '✅ Ya estaba en Alegra — quedó enlazado') + avisoNeg;
        setEstado((s) => ({ ...s, [p.id]: { tipo: 'ok', texto } }));
        return 'ok';
      }
      if (/falta indicar si el precio lleva iva/i.test(data.error || '')) {
        setEstado((s) => ({ ...s, [p.id]: { tipo: 'falta', texto: 'No está en Alegra — elige el IVA y créalo' } }));
        return 'falta';
      }
      setEstado((s) => ({ ...s, [p.id]: { tipo: 'error', texto: data.error || 'Error' } }));
      return /ALEGRA2_EMAIL/.test(data.error || '') ? 'sin-claves' : 'error';
    } catch {
      setEstado((s) => ({ ...s, [p.id]: { tipo: 'error', texto: 'Error de conexión' } }));
      return 'error';
    }
  }

  async function revisarTodos() {
    setTrabajando(true);
    setError('');
    for (const p of productos) {
      if (estado[p.id]?.tipo === 'ok') continue;
      const r = await enviar(p, undefined);
      if (r === 'sin-claves') {
        setError('Falta configurar ALEGRA2_EMAIL y ALEGRA2_TOKEN en Netlify (sitio del POS).');
        break;
      }
    }
    setRevisado(true);
    setTrabajando(false);
  }

  async function crearTodos() {
    setTrabajando(true);
    for (const p of productos) {
      if (estado[p.id]?.tipo === 'ok' || iva[p.id] === undefined) continue;
      const r = await enviar(p, iva[p.id]);
      if (r === 'sin-claves') break;
    }
    setTrabajando(false);
  }

  const pendientes = productos.filter((p) => estado[p.id]?.tipo !== 'ok');
  const listosParaCrear = pendientes.filter((p) => iva[p.id] !== undefined).length;

  return (
    <Shell title="Pendientes en Alegra">
      <div style={{ marginBottom: '14px' }}>
        <Link href="/productos" style={{ color: 'var(--teal-dark)', fontSize: '14px' }}>← Volver a Productos</Link>
      </div>

      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Productos que faltan en Alegra</h3>
        <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)', fontSize: '14px' }}>
          Son productos creados en el POS que no están en Alegra (facturación electrónica). Se crean con la misma
          referencia, el mismo precio de venta, la categoría &quot;Geek&quot; y la foto de portada.
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" style={styles.btnSecundario} onClick={revisarTodos} disabled={trabajando || cargando || !pendientes.length}>
            🔎 1. Revisar cuáles ya están en Alegra
          </button>
          <button type="button" style={styles.btnPrimario} onClick={crearTodos} disabled={trabajando || !listosParaCrear}>
            🧾 2. Crear en Alegra ({listosParaCrear})
          </button>
        </div>
        {!revisado && pendientes.length > 0 && (
          <p style={{ margin: '10px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Empieza por el paso 1: así no se duplica nada que ya exista allá.
          </p>
        )}
        {error && <p style={{ color: 'var(--danger, #c0392b)', margin: '10px 0 0' }}>{error}</p>}
      </div>

      <div style={styles.card}>
        {cargando ? (
          <p>Cargando…</p>
        ) : productos.length === 0 ? (
          <p style={{ margin: 0 }}>✅ Todos los productos del POS están en Alegra.</p>
        ) : (
          productos.map((p) => {
            const e = estado[p.id];
            const listo = e?.tipo === 'ok';
            return (
              <div key={p.id} style={{ ...styles.fila, opacity: listo ? 0.6 : 1 }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {p.imagen_key ? (
                    <img src={`/api/imagenes/${p.imagen_key}`} alt="" style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 6, background: '#fff' }} />
                  ) : (
                    <div style={{ width: 44, height: 44, borderRadius: 6, background: 'var(--bg)' }} />
                  )}
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{p.nombre}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Ref. {p.referencia} · {p.categoria_nombre || 'Sin categoría'} · {moneda(p.precio_venta)}
                      {p.es_inventariable === false ? ' · Servicio' : ''}
                      {p.activo === false ? ' · Inactivo' : ''}
                    </div>
                  </div>
                  {!listo && (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => setIva((s) => ({ ...s, [p.id]: true }))}
                        style={{ ...styles.btnTipo, ...(iva[p.id] === true ? styles.btnTipoActivo : {}) }}
                      >
                        Con IVA (19%)
                      </button>
                      <button
                        type="button"
                        onClick={() => setIva((s) => ({ ...s, [p.id]: false }))}
                        style={{ ...styles.btnTipo, ...(iva[p.id] === false ? styles.btnTipoActivo : {}) }}
                      >
                        Sin IVA
                      </button>
                      <button
                        type="button"
                        style={styles.btnPrimario}
                        disabled={trabajando || iva[p.id] === undefined || e?.tipo === 'trabajando'}
                        onClick={() => enviar(p, iva[p.id])}
                      >
                        Crear
                      </button>
                    </div>
                  )}
                </div>
                {e && (
                  <div style={{ fontSize: '13px', color: e.tipo === 'error' ? 'var(--danger, #c0392b)' : e.tipo === 'ok' ? '#0b7a3e' : 'var(--text-secondary)' }}>
                    {e.texto}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Venta en negativo en Alegra</h3>
        <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)', fontSize: '14px' }}>
          Los productos del POS que ya están en Alegra deben tener &quot;Venta en negativo&quot; activada para poder facturarlos
          (allá no se maneja stock). Los nuevos ya quedan activados solos; aquí se arreglan los que ya se subieron.
        </p>
        {enlazados === null ? (
          <button type="button" style={styles.btnSecundario} onClick={cargarEnlazados}>
            🔎 Ver productos enlazados con Alegra
          </button>
        ) : enlazados.length === 0 ? (
          <p style={{ margin: 0 }}>No hay productos del POS enlazados con Alegra todavía.</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <button type="button" style={styles.btnSecundario} disabled={negTrabajando} onClick={() => activarTodas(enlazados.slice(0, 1))}>
                1. Probar con uno
              </button>
              <button type="button" style={styles.btnPrimario} disabled={negTrabajando} onClick={() => activarTodas(enlazados)}>
                ⚡ 2. Activar en todos ({enlazados.length})
              </button>
              {negTrabajando && (
                <button type="button" style={styles.btnSecundario} onClick={() => { window.__detenerNeg = true; setNegDetener(true); }}>
                  {negDetener ? 'Deteniendo…' : 'Detener'}
                </button>
              )}
            </div>
            <p style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Recomendado: prueba con uno y revísalo en Alegra (Inventario → ese producto → Editar → &quot;Venta en negativo&quot;) antes de hacer todos.
            </p>
            {enlazados.map((p) => {
              const e = negEstado[p.id];
              return (
                <div key={p.id} style={{ ...styles.fila, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{p.nombre}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Ref. {p.referencia} · Alegra #{p.alegra2_id}</div>
                  </div>
                  {e ? (
                    <span style={{ fontSize: '13px', color: e.tipo === 'error' ? 'var(--danger, #c0392b)' : e.tipo === 'ok' ? '#0b7a3e' : 'var(--text-secondary)' }}>{e.texto}</span>
                  ) : (
                    <button type="button" style={styles.btnTipo} disabled={negTrabajando} onClick={() => activarNegativa(p)}>Activar</button>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

    </Shell>
  );
}

const styles = {
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', marginBottom: '20px' },
  fila: { padding: '12px 0', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '6px' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  btnSecundario: { padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' },
  btnTipo: { padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '13px' },
  btnTipoActivo: { borderColor: 'var(--teal)', background: 'var(--teal-light)', color: 'var(--teal-dark)', fontWeight: 600 },
};
