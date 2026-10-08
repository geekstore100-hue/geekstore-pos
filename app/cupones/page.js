'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '../../components/Shell';

// CUPONES (octubre 2026). Dos cosas en una pantalla:
//   1) Canjear un cupón en el local: el bono de servicio técnico (sobre la
//      cotización) o el descuento de compra en la tienda física. El
//      descuento en sí se hace en la cotización / en Vender; aquí queda
//      registrado que el cupón ya se usó.
//   2) El reporte de la campaña: cuántos se entregaron, cuántos se usaron
//      (en la página, en la tienda, en servicio técnico) y cuánto vendieron.
// Los cupones se entregan desde Venta rápida ("🎟️ Dar cupón", o solos en
// el comprobante de cada venta del evento).

function moneda(n) {
  return `$${Math.round(Number(n || 0)).toLocaleString('es-CO')}`;
}
function fecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
function fechaCorta(d) {
  return new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });
}
function soloDigitos(v) {
  return String(v ?? '').replace(/\D/g, '');
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

const VIGENCIA = { antes: 'Todavía no empieza', vigente: 'Vigente', vencido: 'Vencido' };

export default function CuponesPage() {
  const [codigo, setCodigo] = useState('');
  const [cupon, setCupon] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');

  const [srvTotal, setSrvTotal] = useState('');
  const [srvRef, setSrvRef] = useState('');
  const [srvNota, setSrvNota] = useState('');
  const [cmpTotal, setCmpTotal] = useState('');
  const [cmpRef, setCmpRef] = useState('');
  const [canjeando, setCanjeando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const [datos, setDatos] = useState(null);
  const [aviso, setAviso] = useState('');

  const cargarReporte = useCallback(async () => {
    try {
      const d = await (await fetch('/api/cupones')).json();
      if (d.faltaMigracion) setAviso(d.mensaje);
      if (d.ok) setDatos(d);
    } catch {
      // sin conexión: se muestra lo que haya
    }
  }, []);
  useEffect(() => { cargarReporte(); }, [cargarReporte]);

  async function buscar(e) {
    e?.preventDefault();
    setError('');
    setResultado(null);
    setCupon(null);
    const cod = codigo.trim().toUpperCase();
    if (!cod) return;
    setBuscando(true);
    try {
      const d = await (await fetch(`/api/cupones/${encodeURIComponent(cod)}`)).json();
      if (d.ok) setCupon(d.cupon);
      else setError(d.error || 'No se encontró el cupón');
    } catch {
      setError('Error de conexión');
    } finally {
      setBuscando(false);
    }
  }

  async function canjear(tipo) {
    setError('');
    setResultado(null);
    const body =
      tipo === 'servicio'
        ? { tipo, total: Number(srvTotal), referencia: srvRef, nota: srvNota }
        : { tipo, total: Number(cmpTotal), referencia: cmpRef };
    if (!(body.total > 0)) return setError(tipo === 'servicio' ? 'Escribe el valor de la cotización' : 'Escribe el valor de la compra');
    const aviso2 =
      tipo === 'servicio'
        ? `¿Canjear el bono de servicio técnico de ${cupon.codigo} sobre una cotización de ${moneda(body.total)}?`
        : `¿Registrar el descuento de compra de ${cupon.codigo} sobre ${moneda(body.total)}?`;
    if (!window.confirm(aviso2)) return;
    setCanjeando(true);
    try {
      const d = await (await fetch(`/api/cupones/${encodeURIComponent(cupon.codigo)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
      if (!d.ok) return setError(d.error || 'No se pudo canjear');
      setCupon({ ...d.cupon, vigencia: cupon.vigencia });
      setResultado(tipo === 'servicio' ? { tipo, bono: d.bono, total: body.total, garantia: d.cupon.servicio_garantia } : { tipo, descuento: d.descuento, total: body.total });
      cargarReporte();
    } catch {
      setError('Error de conexión');
    } finally {
      setCanjeando(false);
    }
  }

  function csvContactos() {
    if (!datos) return;
    descargarCsv(`Cupones ${datos.campana}.csv`, [
      ['Código', 'Nombre', 'Celular', 'Entregado', 'Venta en el stand', 'Compra usada', 'Dónde', 'Valor compra', 'Servicio usado', 'Valor servicio'],
      ...datos.cupones.map((c) => [
        c.codigo, c.cliente_nombre, c.cliente_telefono, fecha(c.creado_en), c.venta_id ? `#${c.venta_id}` : '',
        c.compra_usada_en ? fecha(c.compra_usada_en) : '', c.compra_donde || '', c.compra_total || '',
        c.servicio_usado_en ? fecha(c.servicio_usado_en) : '', c.servicio_total || '',
      ]),
    ]);
  }

  const r = datos?.resumen;

  return (
    <Shell title="Cupones">
      <style>{`
        .cp { max-width: 900px; margin: 0 auto; }
        .pos-boton-panico { display: none !important; }
        .cp-box { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 14px; }
        .cp-box h3 { margin: 0 0 10px; font-size: 16px; }
        .cp-input { width: 100%; box-sizing: border-box; padding: 11px; border-radius: 10px; border: 1px solid var(--border); font-size: 16px; background: #fff; }
        .cp-btn { border: none; background: var(--teal); color: #fff; font-weight: 700; padding: 11px 16px; border-radius: 10px; font-size: 15px; }
        .cp-btn:disabled { opacity: .5; }
        .cp-sec { border: 1px solid var(--border); background: #fff; color: var(--text); font-weight: 600; padding: 9px 14px; border-radius: 10px; font-size: 14px; text-decoration: none; display: inline-block; }
        .cp-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 700px) { .cp-cols { grid-template-columns: 1fr; } }
        .cp-benef { border: 1px solid var(--border); border-radius: 12px; padding: 12px; }
        .cp-label { font-size: 13px; color: var(--text-secondary); display: block; margin: 10px 0 4px; }
        .cp-ok { background: var(--teal-light); border: 1px solid var(--teal); color: var(--teal-dark); border-radius: 10px; padding: 12px; margin-top: 12px; }
        .cp-usado { background: #f4f6f9; border-radius: 10px; padding: 10px; color: var(--text-secondary); font-size: 14px; }
        .cp-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
        .cp-card { border: 1px solid var(--border); border-radius: 12px; padding: 12px; }
        .cp-card small { display: block; color: var(--text-secondary); font-size: 12px; }
        .cp-card strong { font-size: 20px; }
        .cp-tabla { width: 100%; border-collapse: collapse; font-size: 13px; }
        .cp-tabla th { text-align: left; color: var(--text-secondary); padding: 6px; border-bottom: 1px solid var(--border); }
        .cp-tabla td { padding: 8px 6px; border-bottom: 1px solid var(--border); vertical-align: top; }
      `}</style>
      <div className="cp">
        {aviso && <p style={{ background: '#fff4e5', border: '1px solid #f5c377', color: '#8a5a00', borderRadius: '10px', padding: '10px 12px' }}>{aviso}</p>}

        <div className="cp-box">
          <h3>Canjear un cupón</h3>
          <form onSubmit={buscar} style={{ display: 'flex', gap: '8px' }}>
            <input className="cp-input" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="SOFA-XXXXX" autoCapitalize="characters" autoComplete="off" />
            <button type="submit" className="cp-btn" disabled={buscando}>{buscando ? '...' : 'Buscar'}</button>
          </form>
          {error && <p style={{ color: 'var(--danger)', margin: '10px 0 0' }}>{error}</p>}

          {cupon && (
            <div style={{ marginTop: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontSize: '22px', fontWeight: 800 }}>{cupon.codigo}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {cupon.campana}
                    {cupon.cliente_nombre ? ` · ${cupon.cliente_nombre}` : ''}
                    {cupon.cliente_telefono ? ` · ${cupon.cliente_telefono}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '13px' }}>
                  <strong style={{ color: cupon.vigencia === 'vigente' ? 'var(--teal-dark)' : 'var(--danger)' }}>{VIGENCIA[cupon.vigencia]}</strong>
                  <div style={{ color: 'var(--text-secondary)' }}>Del {fechaCorta(cupon.valido_desde)} al {fechaCorta(cupon.valido_hasta)}</div>
                </div>
              </div>

              <div className="cp-cols">
                <div className="cp-benef">
                  <strong>🔧 Servicio técnico</strong>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 8px' }}>
                    Bono de {moneda(cupon.servicio_bono)} desde {moneda(cupon.servicio_minimo)}. {cupon.servicio_garantia}.
                  </div>
                  {cupon.servicio_usado_en ? (
                    <div className="cp-usado">Ya usado el {fecha(cupon.servicio_usado_en)} · cotización {moneda(cupon.servicio_total)}{cupon.servicio_ref ? ` · ${cupon.servicio_ref}` : ''}</div>
                  ) : (
                    <>
                      <label className="cp-label">Valor de la cotización (antes del bono)</label>
                      <input className="cp-input" inputMode="numeric" value={srvTotal ? Number(srvTotal).toLocaleString('es-CO') : ''} onChange={(e) => setSrvTotal(soloDigitos(e.target.value))} placeholder="$0" />
                      <label className="cp-label">Equipo / orden</label>
                      <input className="cp-input" value={srvRef} onChange={(e) => setSrvRef(e.target.value)} placeholder="Ej. Control PS5 – drift" />
                      <label className="cp-label">Nota (opcional)</label>
                      <input className="cp-input" value={srvNota} onChange={(e) => setSrvNota(e.target.value)} />
                      <button type="button" className="cp-btn" style={{ marginTop: '10px', width: '100%' }} disabled={canjeando || cupon.vigencia !== 'vigente'} onClick={() => canjear('servicio')}>
                        Canjear bono de servicio
                      </button>
                    </>
                  )}
                </div>

                <div className="cp-benef">
                  <strong>🛒 Compra</strong>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 8px' }}>
                    {Number(cupon.compra_porcentaje)}% hasta {moneda(cupon.compra_tope)}{cupon.compra_excluir ? ` · no aplica en ${cupon.compra_excluir.toLowerCase()}` : ''}. En la página se aplica solo en el carrito.
                  </div>
                  {cupon.compra_usada_en ? (
                    <div className="cp-usado">
                      Ya usado {cupon.compra_donde === 'web' ? 'en la página' : 'en la tienda'} el {fecha(cupon.compra_usada_en)} · descuento {moneda(cupon.compra_descuento)} sobre {moneda(cupon.compra_total)}
                      {cupon.compra_ref ? ` · ${cupon.compra_ref}` : ''}
                    </div>
                  ) : (
                    <>
                      <label className="cp-label">Valor de los productos (sin {String(cupon.compra_excluir || 'excluidos').toLowerCase()})</label>
                      <input className="cp-input" inputMode="numeric" value={cmpTotal ? Number(cmpTotal).toLocaleString('es-CO') : ''} onChange={(e) => setCmpTotal(soloDigitos(e.target.value))} placeholder="$0" />
                      <label className="cp-label">N.° de venta (opcional)</label>
                      <input className="cp-input" value={cmpRef} onChange={(e) => setCmpRef(e.target.value)} placeholder="Ej. Venta #1234" />
                      <button type="button" className="cp-btn" style={{ marginTop: '10px', width: '100%' }} disabled={canjeando || cupon.vigencia !== 'vigente'} onClick={() => canjear('compra')}>
                        Registrar descuento en tienda
                      </button>
                    </>
                  )}
                </div>
              </div>

              {resultado?.tipo === 'servicio' && (
                <div className="cp-ok">
                  ✅ Bono canjeado: descuenta <strong>{moneda(resultado.bono)}</strong> de la cotización. Total a pagar: <strong>{moneda(resultado.total - resultado.bono)}</strong>.
                  <div style={{ marginTop: '6px' }}>Anota en la orden: <strong>{resultado.garantia}</strong>.</div>
                </div>
              )}
              {resultado?.tipo === 'compra' && (
                <div className="cp-ok">
                  ✅ Descuento registrado: aplica <strong>{moneda(resultado.descuento)}</strong> en Vender (sobre {moneda(resultado.total)}).
                </div>
              )}
            </div>
          )}
        </div>

        {datos && r && (
          <div className="cp-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>Campaña {datos.campana}</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Link href="/ventas/rapida" className="cp-sec">🎟️ Dar cupón</Link>
                <button type="button" className="cp-sec" onClick={csvContactos}>⬇ Contactos (CSV)</button>
              </div>
            </div>
            <div className="cp-cards">
              <div className="cp-card"><small>Entregados</small><strong>{r.entregados}</strong><small>{r.conCelular} con celular · {r.conCompraEnStand} con compra</small></div>
              <div className="cp-card"><small>Usados en la página</small><strong>{r.compraWeb.usados}</strong><small>{moneda(r.compraWeb.ventas)} en ventas · {moneda(r.compraWeb.descuentos)} en descuentos</small></div>
              <div className="cp-card"><small>Usados en la tienda</small><strong>{r.compraTienda.usados}</strong><small>{moneda(r.compraTienda.ventas)} en ventas · {moneda(r.compraTienda.descuentos)} en descuentos</small></div>
              <div className="cp-card"><small>Servicio técnico</small><strong>{r.servicio.usados}</strong><small>{moneda(r.servicio.ventas)} en reparaciones · {moneda(r.servicio.bonos)} en bonos</small></div>
            </div>
            <div style={{ overflowX: 'auto', marginTop: '12px' }}>
              <table className="cp-tabla">
                <thead>
                  <tr><th>Código</th><th>Cliente</th><th>Entregado</th><th>Compra</th><th>Servicio</th></tr>
                </thead>
                <tbody>
                  {datos.cupones.slice(0, 300).map((c) => (
                    <tr key={c.id}>
                      <td><button type="button" onClick={() => { setCodigo(c.codigo); window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ border: 'none', background: 'none', color: 'var(--teal-dark)', fontWeight: 700, padding: 0 }}>{c.codigo}</button></td>
                      <td>{c.cliente_nombre || '—'}{c.cliente_telefono ? <div style={{ color: 'var(--text-secondary)' }}>{c.cliente_telefono}</div> : null}</td>
                      <td>{fecha(c.creado_en)}{c.venta_id ? <div style={{ color: 'var(--text-secondary)' }}>Venta #{c.venta_id}</div> : null}</td>
                      <td>{c.compra_usada_en ? `✅ ${c.compra_donde === 'web' ? 'Página' : 'Tienda'} · ${moneda(c.compra_total)}` : '—'}</td>
                      <td>{c.servicio_usado_en ? `✅ ${moneda(c.servicio_total)}` : '—'}</td>
                    </tr>
                  ))}
                  {!datos.cupones.length && <tr><td colSpan={5} style={{ color: 'var(--text-secondary)' }}>Todavía no se ha entregado ningún cupón.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
