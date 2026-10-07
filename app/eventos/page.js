'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Shell from '../../components/Shell';
import { textoComprobante, enlaceWhatsapp } from '../../lib/comprobanteWhatsapp';

// Resumen de las ventas de un EVENTO (ej. SOFA 2026), octubre 2026.
// Lo principal para las cuentas internas: qué se vendió desde Bodega
// Distribuidor (unidades, valor vendido, valor a precio de distribuidor y
// costo), aparte de lo que salió de Principal. También: total por medio
// de pago (para cuadrar la plata del evento), por día, y cada venta (con
// reenvío del comprobante por WhatsApp y anulación del mismo día).
// Las ventas de eventos NO están en ningún turno de caja.

function moneda(n) {
  return `$${Math.round(Number(n || 0)).toLocaleString('es-CO')}`;
}
function fechaHora(iso) {
  return new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
function descargarCsv(nombre, filas) {
  const csv = filas.map((f) => f.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Contenido() {
  const router = useRouter();
  const params = useSearchParams();
  const elegido = params.get('evento') || '';

  const [eventos, setEventos] = useState([]);
  const [aviso, setAviso] = useState('');
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState(null);
  const [empresa, setEmpresa] = useState({});

  useEffect(() => {
    fetch('/api/eventos')
      .then((r) => r.json())
      .then((d) => {
        if (d.faltaMigracion) setAviso(d.mensaje);
        if (d.ok) {
          setEventos(d.eventos);
          if (!elegido && d.eventos[0]) router.replace(`/eventos?evento=${encodeURIComponent(d.eventos[0].evento)}`);
        }
      })
      .catch(() => setError('Error de conexión'));
    fetch('/api/configuracion/datos-empresa')
      .then((r) => r.json())
      .then((d) => d.ok && setEmpresa({ nit: d.nit, telefono: d.telefono }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargar = useCallback(async () => {
    if (!elegido) return;
    setCargando(true);
    setError('');
    try {
      const d = await (await fetch(`/api/eventos?evento=${encodeURIComponent(elegido)}`)).json();
      if (d.ok) setDatos(d);
      else setError(d.error || 'No se pudo cargar el evento');
    } catch {
      setError('Error de conexión');
    } finally {
      setCargando(false);
    }
  }, [elegido]);
  useEffect(() => { cargar(); }, [cargar]);

  async function anular(v) {
    if (!window.confirm(`¿Anular la venta #${v.id} de ${moneda(v.total)}? Los productos vuelven a su bodega.`)) return;
    try {
      const d = await (await fetch(`/api/ventas/${v.id}`, { method: 'POST' })).json();
      if (!d.ok) return window.alert(d.error || 'No se pudo anular');
      cargar();
    } catch {
      window.alert('Error de conexión');
    }
  }

  const distribuidor = datos?.bodegas.find((b) => b.bodega === 'Bodega Distribuidor');

  function csvDistribuidor() {
    if (!distribuidor) return;
    descargarCsv(`${elegido} - vendido desde Bodega Distribuidor.csv`, [
      ['Referencia', 'Producto', 'Unidades', 'Valor vendido', 'Precio distribuidor (unidad)', 'Valor a precio distribuidor', 'Costo promedio (unidad)', 'Costo total'],
      ...distribuidor.productos.map((p) => [p.referencia, p.nombre, p.unidades, Math.round(p.vendido), p.precioDistribuidor, Math.round(p.precioDistribuidor * p.unidades), Math.round(p.costoUnitario), Math.round(p.costoUnitario * p.unidades)]),
      ['', 'TOTAL', distribuidor.unidades, Math.round(distribuidor.vendido), '', Math.round(distribuidor.precioDistribuidor), '', Math.round(distribuidor.costo)],
    ]);
  }

  return (
    <div className="ev">
      <style>{`
        .ev { max-width: 900px; margin: 0 auto; }
        .ev-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 14px; }
        .ev-card { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; }
        .ev-card small { color: var(--text-secondary); font-size: 12px; display: block; }
        .ev-card strong { font-size: 20px; }
        .ev-box { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 14px; }
        .ev-box h3 { margin: 0 0 10px; font-size: 16px; }
        .ev-fila { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 14px; }
        .ev-fila:last-child { border-bottom: none; }
        .ev-tabla { width: 100%; border-collapse: collapse; font-size: 13px; }
        .ev-tabla th { text-align: left; color: var(--text-secondary); font-weight: 600; padding: 6px; border-bottom: 1px solid var(--border); }
        .ev-tabla td { padding: 8px 6px; border-bottom: 1px solid var(--border); vertical-align: top; }
        .ev-num { text-align: right; white-space: nowrap; }
        .ev-tabla td:first-child { min-width: 160px; }
        .pos-boton-panico { display: none !important; }
        .ev-scroll { overflow-x: auto; }
        .ev-btn { border: 1px solid var(--border); background: #fff; border-radius: 9px; padding: 8px 12px; font-weight: 600; font-size: 13px; color: var(--text); text-decoration: none; display: inline-block; }
        .ev-destacado { border-color: var(--teal); box-shadow: 0 0 0 2px var(--teal-light); }
      `}</style>

      {aviso && <p style={{ background: '#fff4e5', border: '1px solid #f5c377', color: '#8a5a00', borderRadius: '10px', padding: '10px 12px' }}>{aviso}</p>}

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
        <select
          value={elegido}
          onChange={(e) => router.replace(`/eventos?evento=${encodeURIComponent(e.target.value)}`)}
          style={{ padding: '10px', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '15px', minWidth: '200px' }}
        >
          {!eventos.length && <option value="">Todavía no hay ventas de eventos</option>}
          {elegido && !eventos.some((e) => e.evento === elegido) && <option value={elegido}>{elegido}</option>}
          {eventos.map((e) => <option key={e.evento} value={e.evento}>{e.evento} · {moneda(e.total)}</option>)}
        </select>
        <button type="button" className="ev-btn" onClick={cargar} disabled={cargando}>{cargando ? 'Actualizando...' : '↻ Actualizar'}</button>
        <Link href="/ventas/rapida" className="ev-btn" style={{ marginLeft: 'auto' }}>+ Venta rápida</Link>
      </div>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {datos && (
        <>
          <div className="ev-cards">
            <div className="ev-card"><small>Total vendido</small><strong>{moneda(datos.resumen.total)}</strong></div>
            <div className="ev-card"><small>Ventas</small><strong>{datos.resumen.ventas}</strong></div>
            <div className="ev-card"><small>Unidades</small><strong>{datos.resumen.unidades}</strong></div>
            <div className="ev-card"><small>Desde Distribuidor</small><strong>{moneda(distribuidor?.vendido || 0)}</strong></div>
          </div>

          <div className="ev-box">
            <h3>Plata por medio de pago</h3>
            {datos.pagos.map((p) => (
              <div key={p.medio_pago} className="ev-fila"><span>{p.medio_pago} <small style={{ color: 'var(--text-secondary)' }}>({p.ventas} ventas)</small></span><strong>{moneda(p.total)}</strong></div>
            ))}
            {!datos.pagos.length && <div style={{ color: 'var(--text-secondary)' }}>Sin ventas todavía.</div>}
          </div>

          {datos.bodegas.map((b) => (
            <div key={b.bodega} className={`ev-box${b.bodega === 'Bodega Distribuidor' ? ' ev-destacado' : ''}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <h3 style={{ margin: 0 }}>Vendido desde {b.bodega}</h3>
                {b.bodega === 'Bodega Distribuidor' && <button type="button" className="ev-btn" onClick={csvDistribuidor}>⬇ Descargar Excel (CSV)</button>}
              </div>
              <div className="ev-cards" style={{ marginBottom: '10px' }}>
                <div className="ev-card"><small>Unidades</small><strong>{b.unidades}</strong></div>
                <div className="ev-card"><small>Valor vendido</small><strong>{moneda(b.vendido)}</strong></div>
                {b.bodega === 'Bodega Distribuidor' && <div className="ev-card"><small>A precio distribuidor</small><strong>{moneda(b.precioDistribuidor)}</strong></div>}
                <div className="ev-card"><small>Costo</small><strong>{moneda(b.costo)}</strong></div>
              </div>
              <div className="ev-scroll">
                <table className="ev-tabla">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th className="ev-num">Und</th>
                      <th className="ev-num">Vendido</th>
                      {b.bodega === 'Bodega Distribuidor' && <th className="ev-num">Precio distrib.</th>}
                      <th className="ev-num">Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.productos.map((p) => (
                      <tr key={p.producto_id}>
                        <td>{p.nombre}{p.referencia ? <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Ref {p.referencia}</div> : null}</td>
                        <td className="ev-num">{p.unidades}</td>
                        <td className="ev-num">{moneda(p.vendido)}</td>
                        {b.bodega === 'Bodega Distribuidor' && <td className="ev-num">{moneda(p.precioDistribuidor * p.unidades)}</td>}
                        <td className="ev-num">{moneda(p.costoUnitario * p.unidades)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {datos.dias.length > 1 && (
            <div className="ev-box">
              <h3>Por día</h3>
              {datos.dias.map((d) => (
                <div key={d.dia} className="ev-fila"><span>{new Date(`${d.dia}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })} · {d.ventas} ventas</span><strong>{moneda(d.total)}</strong></div>
              ))}
            </div>
          )}

          <div className="ev-box">
            <h3>Ventas ({datos.ventas.length}{datos.resumen.anuladas ? `, ${datos.resumen.anuladas} anulada(s)` : ''})</h3>
            {datos.ventas.map((v) => (
              <div key={v.id} style={{ borderBottom: '1px solid var(--border)', padding: '10px 0', opacity: v.anulada ? 0.5 : 1 }}>
                <div onClick={() => setAbierta(abierta === v.id ? null : v.id)} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', cursor: 'pointer' }}>
                  <span>
                    <strong>#{v.id}</strong> · {fechaHora(v.creado_en)} · {v.medio_pago}
                    {v.cliente_nombre ? ` · ${v.cliente_nombre}` : ''}
                    {v.anulada ? ' · ANULADA' : ''}
                  </span>
                  <strong style={{ textDecoration: v.anulada ? 'line-through' : 'none' }}>{moneda(v.total)}</strong>
                </div>
                {abierta === v.id && (
                  <div style={{ marginTop: '8px', fontSize: '14px' }}>
                    {v.lineas.map((l, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', color: 'var(--text-secondary)' }}>
                        <span>{l.cantidad} × {l.nombre} <small>({l.bodega === 'Bodega Distribuidor' ? 'Distribuidor' : l.bodega})</small></span>
                        <span>{moneda(l.cantidad * l.precio)}</span>
                      </div>
                    ))}
                    {v.vendedor_nombre && <div style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>Vendedor: {v.vendedor_nombre}</div>}
                    {!v.anulada && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                        <a
                          className="ev-btn"
                          target="_blank"
                          rel="noopener noreferrer"
                          href={enlaceWhatsapp(
                            v.cliente_telefono,
                            textoComprobante(
                              {
                                numero: v.id,
                                fecha: v.creado_en,
                                evento: elegido,
                                lineas: v.lineas,
                                total: v.total,
                                pagos: [{ medio_pago: v.medio_pago, monto: v.total }],
                                clienteNombre: v.cliente_nombre,
                              },
                              empresa
                            )
                          )}
                        >
                          Reenviar por WhatsApp
                        </a>
                        <button type="button" className="ev-btn" style={{ color: 'var(--danger)' }} onClick={() => anular(v)}>Anular</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!datos.ventas.length && <div style={{ color: 'var(--text-secondary)' }}>Todavía no hay ventas en este evento.</div>}
          </div>
        </>
      )}
    </div>
  );
}

export default function EventosPage() {
  return (
    <Shell title="Ventas de eventos">
      <Suspense fallback={null}>
        <Contenido />
      </Suspense>
    </Shell>
  );
}
