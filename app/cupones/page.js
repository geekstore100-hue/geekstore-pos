'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Shell from '../../components/Shell';
import { enlaceWhatsapp } from '../../lib/comprobanteWhatsapp';
import {
  textoCuponWhatsapp,
  descripcionCompra,
  descripcionServicio,
  tieneServicio,
  prefijoDesdeNombre,
  limpiarPrefijo,
  enlaceCupon,
  excluidas,
} from '../../lib/cuponTexto';

// CUPONES (octubre 2026). En una pantalla:
//   1) Canjear un cupón en el local: el descuento de compra en la tienda
//      física o el bono de servicio técnico (si la campaña lo trae). El
//      descuento en sí se hace en la cotización / en Vender; aquí queda
//      registrado que el cupón ya se usó.
//   2) Crear cupones personalizados: campañas con su nombre, prefijo del
//      código, descuento en PORCENTAJE (con tope opcional) o en VALOR FIJO,
//      compra mínima, categorías que no aplican, vigencia y mensaje. Se
//      generan uno por uno (con nombre/celular → WhatsApp, o con un código
//      escrito a mano) o varios de una vez (lista + CSV).
//   3) El reporte de cada campaña: entregados, usados y cuánto vendieron.
// "🎟️ Dar cupón" de Venta rápida usa la campaña ACTIVA (se elige aquí).

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
function conPuntos(v) {
  return v === '' || v === null || v === undefined ? '' : Number(v).toLocaleString('es-CO');
}
function hoy(masDias = 0) {
  const d = new Date(Date.now() + masDias * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
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
async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}
async function pedir(url, body) {
  const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  return r.json();
}

const VIGENCIA = { antes: 'Todavía no empieza', vigente: 'Vigente', vencido: 'Vencido' };

const FORM_NUEVO = () => ({
  id: null,
  nombre: '',
  prefijo: '',
  compra_tipo: 'porcentaje',
  compra_porcentaje: '10',
  compra_monto: '',
  compra_tope: '',
  compra_minimo: '',
  compra_excluir: '',
  valido_desde: hoy(),
  valido_hasta: hoy(30),
  mensaje: '',
  conServicio: false,
  servicio_bono: '',
  servicio_minimo: '',
  servicio_garantia: '',
});

function formDesdeCampana(k) {
  const n = (v) => (v === null || v === undefined || Number(v) === 0 ? '' : String(Math.round(Number(v))));
  return {
    id: k.id,
    nombreAnterior: k.nombre,
    nombre: k.nombre,
    prefijo: k.prefijo,
    prefijoEditado: true,
    compra_tipo: k.compra_tipo === 'monto' ? 'monto' : 'porcentaje',
    compra_porcentaje: k.compra_tipo === 'monto' ? '10' : String(Number(k.compra_porcentaje)),
    compra_monto: n(k.compra_monto),
    compra_tope: n(k.compra_tope),
    compra_minimo: n(k.compra_minimo),
    compra_excluir: k.compra_excluir || '',
    valido_desde: String(k.valido_desde).slice(0, 10),
    valido_hasta: String(k.valido_hasta).slice(0, 10),
    mensaje: k.mensaje || '',
    conServicio: Number(k.servicio_bono) > 0,
    servicio_bono: n(k.servicio_bono),
    servicio_minimo: n(k.servicio_minimo),
    servicio_garantia: k.servicio_garantia || '',
  };
}

export default function CuponesPage() {
  // ── Canje ──
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

  // ── Campañas y reporte ──
  const [campanas, setCampanas] = useState([]);
  const [sel, setSel] = useState(''); // nombre de la campaña elegida, o '__nueva'
  const [datos, setDatos] = useState(null);
  const [aviso, setAviso] = useState('');
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(FORM_NUEVO);
  const [guardando, setGuardando] = useState(false);
  const [errCamp, setErrCamp] = useState('');
  const [okCamp, setOkCamp] = useState('');

  // ── Generar ──
  const [modoGen, setModoGen] = useState('uno');
  const [unoNombre, setUnoNombre] = useState('');
  const [unoTel, setUnoTel] = useState('');
  const [unoCodigo, setUnoCodigo] = useState('');
  const [unoRes, setUnoRes] = useState(null);
  const [loteN, setLoteN] = useState('10');
  const [loteRes, setLoteRes] = useState(null);
  const [generando, setGenerando] = useState(false);
  const [errGen, setErrGen] = useState('');
  const [copiado, setCopiado] = useState('');

  const campana = useMemo(() => campanas.find((k) => k.nombre === sel) || null, [campanas, sel]);

  const cargarReporte = useCallback(async (nombre) => {
    try {
      const d = await pedir(`/api/cupones${nombre ? `?campana=${encodeURIComponent(nombre)}` : ''}`);
      if (d.faltaMigracion) setAviso(d.mensaje);
      if (d.ok) {
        setDatos(d);
        setCampanas(d.campanas || []);
        setSel((s) => s || d.campana);
      }
    } catch {
      // sin conexión: se muestra lo que haya
    }
  }, []);
  useEffect(() => { cargarReporte(); }, [cargarReporte]);

  function elegirCampana(nombre) {
    setSel(nombre);
    setErrCamp('');
    setOkCamp('');
    setUnoRes(null);
    setLoteRes(null);
    setErrGen('');
    if (nombre === '__nueva') {
      setForm(FORM_NUEVO());
      setEditando(true);
      return;
    }
    setEditando(false);
    cargarReporte(nombre);
  }

  function cambiar(campo, valor) {
    setForm((f) => {
      const n = { ...f, [campo]: valor };
      if (campo === 'prefijo') n.prefijoEditado = true;
      if (campo === 'nombre' && !f.prefijoEditado) n.prefijo = prefijoDesdeNombre(valor);
      return n;
    });
  }

  async function guardarCampana() {
    setErrCamp('');
    setOkCamp('');
    const f = form;
    const body = {
      accion: 'guardar',
      ...f,
      compra_porcentaje: Number(f.compra_porcentaje) || 0,
      compra_monto: Number(f.compra_monto) || 0,
      compra_tope: Number(f.compra_tope) || 0,
      compra_minimo: Number(f.compra_minimo) || 0,
      servicio_bono: f.conServicio ? Number(f.servicio_bono) || 0 : 0,
      servicio_minimo: f.conServicio ? Number(f.servicio_minimo) || 0 : 0,
      servicio_garantia: f.conServicio ? f.servicio_garantia : '',
    };
    if (f.conServicio && !(body.servicio_bono > 0)) return setErrCamp('Escribe el valor del bono de servicio técnico, o quita esa opción');
    setGuardando(true);
    try {
      const d = await pedir('/api/cupones/campanas', body);
      if (!d.ok) return setErrCamp(d.error || 'No se pudo guardar');
      setCampanas(d.campanas || []);
      setSel(d.campana.nombre);
      setEditando(false);
      setOkCamp(f.id ? 'Cambios guardados.' : `Campaña "${d.campana.nombre}" creada. Ya puedes generar sus cupones.`);
      cargarReporte(d.campana.nombre);
    } catch {
      setErrCamp('Error de conexión');
    } finally {
      setGuardando(false);
    }
  }

  async function activar() {
    if (!campana) return;
    setErrCamp('');
    try {
      const d = await pedir('/api/cupones/campanas', { accion: 'activar', id: campana.id });
      if (!d.ok) return setErrCamp(d.error || 'No se pudo activar');
      setCampanas(d.campanas || []);
      setOkCamp(`"${campana.nombre}" es ahora la campaña de 🎟️ Dar cupón en Venta rápida.`);
    } catch {
      setErrCamp('Error de conexión');
    }
  }

  async function crearUno() {
    setErrGen('');
    setUnoRes(null);
    setGenerando(true);
    try {
      const d = await pedir('/api/cupones', { campana: campana.nombre, nombre: unoNombre.trim(), telefono: soloDigitos(unoTel), codigo: unoCodigo.trim() });
      if (!d.ok) return setErrGen(d.error || 'No se pudo crear');
      setUnoRes({ ...d.cupon, _existente: Boolean(d.existente) });
      cargarReporte(campana.nombre);
    } catch {
      setErrGen('Error de conexión');
    } finally {
      setGenerando(false);
    }
  }

  async function crearVarios() {
    setErrGen('');
    setLoteRes(null);
    const n = Number(loteN);
    if (!(n >= 1 && n <= 500)) return setErrGen('La cantidad debe ser entre 1 y 500');
    if (!window.confirm(`¿Crear ${n} cupones de "${campana.nombre}"?`)) return;
    setGenerando(true);
    try {
      const d = await pedir('/api/cupones/lote', { campana: campana.nombre, cantidad: n });
      if (!d.ok) return setErrGen(d.error || 'No se pudieron crear');
      setLoteRes(d.cupones);
      cargarReporte(campana.nombre);
    } catch {
      setErrGen('Error de conexión');
    } finally {
      setGenerando(false);
    }
  }

  async function copiarCon(clave, texto) {
    if (await copiar(texto)) {
      setCopiado(clave);
      setTimeout(() => setCopiado(''), 1800);
    }
  }

  async function buscar(e) {
    e?.preventDefault();
    setError('');
    setResultado(null);
    setCupon(null);
    const cod = codigo.trim().toUpperCase();
    if (!cod) return;
    setBuscando(true);
    try {
      const d = await pedir(`/api/cupones/${encodeURIComponent(cod)}`);
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
      const d = await pedir(`/api/cupones/${encodeURIComponent(cupon.codigo)}`, body);
      if (!d.ok) return setError(d.error || 'No se pudo canjear');
      setCupon({ ...d.cupon, vigencia: cupon.vigencia });
      setResultado(tipo === 'servicio' ? { tipo, bono: d.bono, total: body.total, garantia: d.cupon.servicio_garantia } : { tipo, descuento: d.descuento, total: body.total });
      cargarReporte(sel && sel !== '__nueva' ? sel : undefined);
    } catch {
      setError('Error de conexión');
    } finally {
      setCanjeando(false);
    }
  }

  function csvContactos() {
    if (!datos) return;
    descargarCsv(`Cupones ${datos.campana}.csv`, [
      ['Código', 'Enlace', 'Nombre', 'Celular', 'Entregado', 'Venta', 'Compra usada', 'Dónde', 'Valor compra', 'Descuento', 'Servicio usado', 'Valor servicio'],
      ...datos.cupones.map((c) => [
        c.codigo, enlaceCupon(c), c.cliente_nombre, c.cliente_telefono, fecha(c.creado_en), c.venta_id ? `#${c.venta_id}` : '',
        c.compra_usada_en ? fecha(c.compra_usada_en) : '', c.compra_donde || '', c.compra_total || '', c.compra_descuento || '',
        c.servicio_usado_en ? fecha(c.servicio_usado_en) : '', c.servicio_total || '',
      ]),
    ]);
  }

  // Vista previa del mensaje con lo que hay en el formulario.
  const vistaPrevia = useMemo(() => {
    const f = form;
    const ejemplo = {
      ...f,
      codigo: `${f.prefijo || 'CUPON'}-7K3PX`,
      campana: f.nombre,
      cliente_nombre: 'Laura',
      mensaje: f.mensaje || '',
      servicio_bono: f.conServicio ? f.servicio_bono : 0,
    };
    try {
      return textoCuponWhatsapp(ejemplo);
    } catch {
      return '';
    }
  }, [form]);

  const r = datos?.resumen;
  const conServicioReporte = datos?.config ? tieneServicio(datos.config) : true;
  const textoUno = unoRes ? textoCuponWhatsapp({ ...unoRes, cliente_nombre: unoNombre.trim() || unoRes.cliente_nombre }) : '';

  return (
    <Shell title="Cupones">
      <style>{`
        .cp { max-width: 900px; margin: 0 auto; }
        .pos-boton-panico { display: none !important; }
        .cp-box { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 14px; }
        .cp-box h3 { margin: 0 0 10px; font-size: 16px; }
        .cp-input { width: 100%; box-sizing: border-box; padding: 11px; border-radius: 10px; border: 1px solid var(--border); font-size: 16px; background: #fff; }
        .cp-btn { border: none; background: var(--teal); color: #fff; font-weight: 700; padding: 11px 16px; border-radius: 10px; font-size: 15px; cursor: pointer; }
        .cp-btn:disabled { opacity: .5; }
        .cp-sec { border: 1px solid var(--border); background: #fff; color: var(--text); font-weight: 600; padding: 9px 14px; border-radius: 10px; font-size: 14px; text-decoration: none; display: inline-block; cursor: pointer; }
        .cp-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .cp-cols3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
        @media (max-width: 700px) { .cp-cols, .cp-cols3 { grid-template-columns: 1fr; } }
        .cp-benef { border: 1px solid var(--border); border-radius: 12px; padding: 12px; }
        .cp-label { font-size: 13px; color: var(--text-secondary); display: block; margin: 10px 0 4px; }
        .cp-ayuda { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
        .cp-ok { background: var(--teal-light); border: 1px solid var(--teal); color: var(--teal-dark); border-radius: 10px; padding: 12px; margin-top: 12px; }
        .cp-err { color: var(--danger); margin: 10px 0 0; }
        .cp-usado { background: #f4f6f9; border-radius: 10px; padding: 10px; color: var(--text-secondary); font-size: 14px; }
        .cp-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
        .cp-card { border: 1px solid var(--border); border-radius: 12px; padding: 12px; }
        .cp-card small { display: block; color: var(--text-secondary); font-size: 12px; }
        .cp-card strong { font-size: 20px; }
        .cp-tabla { width: 100%; border-collapse: collapse; font-size: 13px; }
        .cp-tabla th { text-align: left; color: var(--text-secondary); padding: 6px; border-bottom: 1px solid var(--border); }
        .cp-tabla td { padding: 8px 6px; border-bottom: 1px solid var(--border); vertical-align: top; }
        .cp-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
        .cp-seg button { border: none; background: #fff; padding: 9px 14px; font-size: 14px; font-weight: 600; color: var(--text-secondary); cursor: pointer; }
        .cp-seg button.on { background: var(--teal); color: #fff; }
        .cp-resumen { background: #f7f9fb; border-radius: 10px; padding: 10px 12px; font-size: 14px; margin-top: 10px; line-height: 1.5; }
        .cp-chip { display: inline-block; font-size: 12px; font-weight: 700; border-radius: 999px; padding: 3px 9px; }
        .cp-previa { white-space: pre-wrap; background: #e7f8ee; border: 1px solid #b7e4c7; border-radius: 10px; padding: 10px 12px; font-size: 13px; line-height: 1.45; margin: 0; font-family: inherit; }
        .cp-codigo { font-size: 28px; font-weight: 800; letter-spacing: 1px; }
        .cp-acciones { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
      `}</style>
      <div className="cp">
        {aviso && <p style={{ background: '#fff4e5', border: '1px solid #f5c377', color: '#8a5a00', borderRadius: '10px', padding: '10px 12px' }}>{aviso}</p>}

        {/* ─── Canjear ─── */}
        <div className="cp-box">
          <h3>Canjear un cupón</h3>
          <form onSubmit={buscar} style={{ display: 'flex', gap: '8px' }}>
            <input className="cp-input" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="Código del cupón" autoCapitalize="characters" autoComplete="off" />
            <button type="submit" className="cp-btn" disabled={buscando}>{buscando ? '...' : 'Buscar'}</button>
          </form>
          {error && <p className="cp-err">{error}</p>}

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

              <div className={tieneServicio(cupon) ? 'cp-cols' : ''}>
                <div className="cp-benef">
                  <strong>🛒 Compra</strong>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 8px' }}>
                    {descripcionCompra(cupon)}. En la página se aplica solo en el carrito.
                  </div>
                  {cupon.compra_usada_en ? (
                    <div className="cp-usado">
                      Ya usado {cupon.compra_donde === 'web' ? 'en la página' : 'en la tienda'} el {fecha(cupon.compra_usada_en)} · descuento {moneda(cupon.compra_descuento)} sobre {moneda(cupon.compra_total)}
                      {cupon.compra_ref ? ` · ${cupon.compra_ref}` : ''}
                    </div>
                  ) : (
                    <>
                      <label className="cp-label">Valor de los productos{excluidas(cupon).length ? ` (sin ${excluidas(cupon).join(', ').toLowerCase()})` : ''}</label>
                      <input className="cp-input" inputMode="numeric" value={conPuntos(cmpTotal)} onChange={(e) => setCmpTotal(soloDigitos(e.target.value))} placeholder="$0" />
                      <label className="cp-label">N.° de venta (opcional)</label>
                      <input className="cp-input" value={cmpRef} onChange={(e) => setCmpRef(e.target.value)} placeholder="Ej. Venta #1234" />
                      <button type="button" className="cp-btn" style={{ marginTop: '10px', width: '100%' }} disabled={canjeando || cupon.vigencia !== 'vigente'} onClick={() => canjear('compra')}>
                        Registrar descuento en tienda
                      </button>
                    </>
                  )}
                </div>

                {tieneServicio(cupon) && (
                  <div className="cp-benef">
                    <strong>🔧 Servicio técnico</strong>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 8px' }}>
                      {descripcionServicio(cupon)}.{cupon.servicio_garantia ? ` ${cupon.servicio_garantia}.` : ''}
                    </div>
                    {cupon.servicio_usado_en ? (
                      <div className="cp-usado">Ya usado el {fecha(cupon.servicio_usado_en)} · cotización {moneda(cupon.servicio_total)}{cupon.servicio_ref ? ` · ${cupon.servicio_ref}` : ''}</div>
                    ) : (
                      <>
                        <label className="cp-label">Valor de la cotización (antes del bono)</label>
                        <input className="cp-input" inputMode="numeric" value={conPuntos(srvTotal)} onChange={(e) => setSrvTotal(soloDigitos(e.target.value))} placeholder="$0" />
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
                )}
              </div>

              {resultado?.tipo === 'servicio' && (
                <div className="cp-ok">
                  ✅ Bono canjeado: descuenta <strong>{moneda(resultado.bono)}</strong> de la cotización. Total a pagar: <strong>{moneda(resultado.total - resultado.bono)}</strong>.
                  {resultado.garantia && <div style={{ marginTop: '6px' }}>Anota en la orden: <strong>{resultado.garantia}</strong>.</div>}
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

        {/* ─── Crear cupones ─── */}
        {!aviso && (
          <div className="cp-box" id="crear">
            <h3>🎟️ Crear cupones</h3>
            <label className="cp-label" style={{ marginTop: 0 }}>Campaña</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <select className="cp-input" style={{ flex: '1 1 220px', width: 'auto' }} value={sel} onChange={(e) => elegirCampana(e.target.value)} aria-label="Campaña">
                {campanas.map((k) => (
                  <option key={k.id} value={k.nombre}>{k.nombre}{k.activa ? ' (activa)' : ''} · {k.entregados} cupones</option>
                ))}
                <option value="__nueva">＋ Nueva campaña…</option>
              </select>
              {campana && !editando && (
                <button type="button" className="cp-sec" onClick={() => { setForm(formDesdeCampana(campana)); setEditando(true); setOkCamp(''); }}>✏️ Editar</button>
              )}
            </div>

            {campana && !editando && (
              <div className="cp-resumen">
                <div>
                  {campana.activa ? (
                    <span className="cp-chip" style={{ background: 'var(--teal-light)', color: 'var(--teal-dark)' }}>✅ Activa en 🎟️ Dar cupón</span>
                  ) : (
                    <button type="button" className="cp-sec" style={{ padding: '5px 10px', fontSize: '13px' }} onClick={activar}>Usar en 🎟️ Dar cupón</button>
                  )}
                </div>
                <div style={{ marginTop: '6px' }}>🛒 <strong>{descripcionCompra(campana)}</strong></div>
                {tieneServicio(campana) && <div>🔧 {descripcionServicio(campana)}</div>}
                <div style={{ color: 'var(--text-secondary)' }}>
                  Códigos {campana.prefijo}-XXXXX · del {fechaCorta(campana.valido_desde)} al {fechaCorta(campana.valido_hasta)} de {String(campana.valido_hasta).slice(0, 4)}
                </div>
                {campana.mensaje && <div style={{ color: 'var(--text-secondary)' }}>Mensaje: “{campana.mensaje}”</div>}
              </div>
            )}

            {editando && (
              <div style={{ marginTop: '6px' }}>
                <div className="cp-cols">
                  <div>
                    <label className="cp-label">Nombre del cupón</label>
                    <input className="cp-input" value={form.nombre} onChange={(e) => cambiar('nombre', e.target.value)} placeholder="Ej. Navidad 2026" maxLength={60} />
                  </div>
                  <div>
                    <label className="cp-label">Prefijo del código</label>
                    <input className="cp-input" value={form.prefijo} onChange={(e) => cambiar('prefijo', limpiarPrefijo(e.target.value))} placeholder="NAVIDAD" />
                    <div className="cp-ayuda">Los códigos quedan así: <strong>{form.prefijo || 'PREFIJO'}-7K3PX</strong></div>
                  </div>
                </div>

                <label className="cp-label">Tipo de descuento</label>
                <div className="cp-seg">
                  <button type="button" className={form.compra_tipo === 'porcentaje' ? 'on' : ''} onClick={() => cambiar('compra_tipo', 'porcentaje')}>Porcentaje %</button>
                  <button type="button" className={form.compra_tipo === 'monto' ? 'on' : ''} onClick={() => cambiar('compra_tipo', 'monto')}>Valor fijo $</button>
                </div>

                {form.compra_tipo === 'porcentaje' ? (
                  <div className="cp-cols3">
                    <div>
                      <label className="cp-label">Porcentaje</label>
                      <input className="cp-input" inputMode="decimal" value={form.compra_porcentaje} onChange={(e) => cambiar('compra_porcentaje', e.target.value.replace(/[^\d.]/g, ''))} placeholder="10" />
                    </div>
                    <div>
                      <label className="cp-label">Descuento máximo (opcional)</label>
                      <input className="cp-input" inputMode="numeric" value={conPuntos(form.compra_tope)} onChange={(e) => cambiar('compra_tope', soloDigitos(e.target.value))} placeholder="Sin tope" />
                    </div>
                    <div>
                      <label className="cp-label">Compra mínima (opcional)</label>
                      <input className="cp-input" inputMode="numeric" value={conPuntos(form.compra_minimo)} onChange={(e) => cambiar('compra_minimo', soloDigitos(e.target.value))} placeholder="Sin mínimo" />
                    </div>
                  </div>
                ) : (
                  <div className="cp-cols">
                    <div>
                      <label className="cp-label">Valor del descuento</label>
                      <input className="cp-input" inputMode="numeric" value={conPuntos(form.compra_monto)} onChange={(e) => cambiar('compra_monto', soloDigitos(e.target.value))} placeholder="$20.000" />
                    </div>
                    <div>
                      <label className="cp-label">Compra mínima (opcional)</label>
                      <input className="cp-input" inputMode="numeric" value={conPuntos(form.compra_minimo)} onChange={(e) => cambiar('compra_minimo', soloDigitos(e.target.value))} placeholder="Sin mínimo" />
                    </div>
                  </div>
                )}

                <label className="cp-label">No aplica en estas categorías (opcional, separadas por coma)</label>
                <input className="cp-input" value={form.compra_excluir} onChange={(e) => cambiar('compra_excluir', e.target.value)} placeholder="Ej. Consolas" />

                <div className="cp-cols">
                  <div>
                    <label className="cp-label">Válido desde</label>
                    <input className="cp-input" type="date" value={form.valido_desde} onChange={(e) => cambiar('valido_desde', e.target.value)} />
                  </div>
                  <div>
                    <label className="cp-label">Válido hasta</label>
                    <input className="cp-input" type="date" value={form.valido_hasta} onChange={(e) => cambiar('valido_hasta', e.target.value)} />
                  </div>
                </div>

                <label className="cp-label">Mensaje para el cliente (opcional)</label>
                <input className="cp-input" value={form.mensaje} onChange={(e) => cambiar('mensaje', e.target.value)} placeholder="Ej. ¡Feliz Navidad! Gracias por comprar en Geek Store." maxLength={400} />

                <label style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px', fontSize: '14px' }}>
                  <input type="checkbox" checked={form.conServicio} onChange={(e) => cambiar('conServicio', e.target.checked)} />
                  Incluir también un bono de servicio técnico
                </label>
                {form.conServicio && (
                  <div className="cp-cols3">
                    <div>
                      <label className="cp-label">Valor del bono</label>
                      <input className="cp-input" inputMode="numeric" value={conPuntos(form.servicio_bono)} onChange={(e) => cambiar('servicio_bono', soloDigitos(e.target.value))} placeholder="$30.000" />
                    </div>
                    <div>
                      <label className="cp-label">Desde (valor de la reparación)</label>
                      <input className="cp-input" inputMode="numeric" value={conPuntos(form.servicio_minimo)} onChange={(e) => cambiar('servicio_minimo', soloDigitos(e.target.value))} placeholder="$100.000" />
                    </div>
                    <div>
                      <label className="cp-label">Garantía (opcional)</label>
                      <input className="cp-input" value={form.servicio_garantia} onChange={(e) => cambiar('servicio_garantia', e.target.value)} placeholder="Doble garantía: …" />
                    </div>
                  </div>
                )}

                <label className="cp-label">Así le llega al cliente por WhatsApp</label>
                <pre className="cp-previa">{vistaPrevia}</pre>

                {form.id && campana?.entregados > 0 && (
                  <p className="cp-ayuda">Los cambios aplican a los cupones nuevos. Los {campana.entregados} que ya se entregaron conservan sus condiciones.</p>
                )}
                {errCamp && <p className="cp-err">{errCamp}</p>}
                <div className="cp-acciones">
                  <button type="button" className="cp-btn" onClick={guardarCampana} disabled={guardando}>{guardando ? 'Guardando...' : form.id ? 'Guardar cambios' : 'Crear campaña'}</button>
                  {(form.id || campanas.length > 0) && (
                    <button type="button" className="cp-sec" onClick={() => { setEditando(false); setErrCamp(''); if (sel === '__nueva') elegirCampana(datos?.campana || campanas[0]?.nombre || ''); }}>Cancelar</button>
                  )}
                </div>
              </div>
            )}
            {!editando && errCamp && <p className="cp-err">{errCamp}</p>}
            {okCamp && <div className="cp-ok" style={{ marginTop: '10px' }}>{okCamp}</div>}

            {/* Generar */}
            {campana && !editando && (
              <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                <div className="cp-seg">
                  <button type="button" className={modoGen === 'uno' ? 'on' : ''} onClick={() => { setModoGen('uno'); setErrGen(''); }}>Uno por uno</button>
                  <button type="button" className={modoGen === 'lote' ? 'on' : ''} onClick={() => { setModoGen('lote'); setErrGen(''); }}>Varios de una vez</button>
                </div>

                {modoGen === 'uno' && !unoRes && (
                  <>
                    <div className="cp-cols3">
                      <div>
                        <label className="cp-label">Nombre del cliente (opcional)</label>
                        <input className="cp-input" value={unoNombre} onChange={(e) => setUnoNombre(e.target.value)} placeholder="Nombre" autoComplete="off" />
                      </div>
                      <div>
                        <label className="cp-label">Celular (opcional)</label>
                        <input className="cp-input" type="tel" inputMode="tel" value={unoTel} onChange={(e) => setUnoTel(e.target.value)} placeholder="300 123 4567" />
                      </div>
                      <div>
                        <label className="cp-label">Código (opcional)</label>
                        <input className="cp-input" value={unoCodigo} onChange={(e) => setUnoCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} placeholder={`${campana.prefijo}-XXXXX`} maxLength={30} autoCapitalize="characters" />
                      </div>
                    </div>
                    <div className="cp-ayuda">Si no escribes código, se genera uno solo. Cada cupón se usa una sola vez; un celular recibe un solo cupón por campaña.</div>
                    {errGen && <p className="cp-err">{errGen}</p>}
                    <button type="button" className="cp-btn" style={{ marginTop: '10px' }} onClick={crearUno} disabled={generando}>{generando ? 'Creando...' : 'Crear cupón'}</button>
                  </>
                )}

                {modoGen === 'uno' && unoRes && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Código</div>
                    <div className="cp-codigo">{unoRes.codigo}</div>
                    {unoRes._existente && <div style={{ fontSize: '13px', color: '#8a5a00' }}>Este celular ya tenía cupón en esta campaña: es el mismo (uno por persona).</div>}
                    <div className="cp-acciones">
                      <a className="cp-btn" style={{ background: '#25d366', textDecoration: 'none' }} href={enlaceWhatsapp(unoTel || unoRes.cliente_telefono, textoUno)} target="_blank" rel="noopener noreferrer">Enviar por WhatsApp</a>
                      <button type="button" className="cp-sec" onClick={() => copiarCon('msg', textoUno)}>{copiado === 'msg' ? '✓ Copiado' : 'Copiar mensaje'}</button>
                      <button type="button" className="cp-sec" onClick={() => copiarCon('link', enlaceCupon(unoRes))}>{copiado === 'link' ? '✓ Copiado' : 'Copiar enlace'}</button>
                      <button type="button" className="cp-sec" onClick={() => { setUnoRes(null); setUnoNombre(''); setUnoTel(''); setUnoCodigo(''); }}>Otro cupón</button>
                    </div>
                  </div>
                )}

                {modoGen === 'lote' && (
                  <>
                    <label className="cp-label">¿Cuántos cupones? (máximo 500)</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input className="cp-input" style={{ maxWidth: '140px' }} inputMode="numeric" value={loteN} onChange={(e) => setLoteN(soloDigitos(e.target.value).slice(0, 3))} />
                      <button type="button" className="cp-btn" onClick={crearVarios} disabled={generando}>{generando ? 'Creando...' : `Crear ${Number(loteN) || 0} cupones`}</button>
                    </div>
                    <div className="cp-ayuda">Cada uno tiene su propio código y se usa una sola vez. Sirven para imprimir, repartir o mandar por redes.</div>
                    {errGen && <p className="cp-err">{errGen}</p>}
                    {loteRes && (
                      <div style={{ marginTop: '12px' }}>
                        <div className="cp-ok" style={{ marginTop: 0 }}>✅ {loteRes.length} cupones creados.</div>
                        <div className="cp-acciones">
                          <button type="button" className="cp-sec" onClick={() => descargarCsv(`Cupones ${campana.nombre} (${loteRes.length}).csv`, [['Código', 'Enlace'], ...loteRes.map((c) => [c.codigo, enlaceCupon(c)])])}>⬇ Descargar CSV</button>
                          <button type="button" className="cp-sec" onClick={() => copiarCon('lote', loteRes.map((c) => c.codigo).join('\n'))}>{copiado === 'lote' ? '✓ Copiados' : 'Copiar códigos'}</button>
                        </div>
                        <textarea className="cp-input" readOnly rows={Math.min(10, loteRes.length)} style={{ marginTop: '10px', fontFamily: 'monospace', fontSize: '14px' }} value={loteRes.map((c) => c.codigo).join('\n')} />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── Reporte ─── */}
        {datos && r && sel !== '__nueva' && (
          <div className="cp-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>Reporte · {datos.campana}</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Link href="/ventas/rapida?cupon=1" className="cp-sec">🎟️ Dar cupón</Link>
                <button type="button" className="cp-sec" onClick={csvContactos}>⬇ Cupones (CSV)</button>
              </div>
            </div>
            <div className="cp-cards">
              <div className="cp-card"><small>Entregados</small><strong>{r.entregados}</strong><small>{r.conCelular} con celular · {r.conCompraEnStand} con compra</small></div>
              <div className="cp-card"><small>Usados en la página</small><strong>{r.compraWeb.usados}</strong><small>{moneda(r.compraWeb.ventas)} en ventas · {moneda(r.compraWeb.descuentos)} en descuentos</small></div>
              <div className="cp-card"><small>Usados en la tienda</small><strong>{r.compraTienda.usados}</strong><small>{moneda(r.compraTienda.ventas)} en ventas · {moneda(r.compraTienda.descuentos)} en descuentos</small></div>
              {(conServicioReporte || r.servicio.usados > 0) && (
                <div className="cp-card"><small>Servicio técnico</small><strong>{r.servicio.usados}</strong><small>{moneda(r.servicio.ventas)} en reparaciones · {moneda(r.servicio.bonos)} en bonos</small></div>
              )}
            </div>
            <div style={{ overflowX: 'auto', marginTop: '12px' }}>
              <table className="cp-tabla">
                <thead>
                  <tr><th>Código</th><th>Cliente</th><th>Entregado</th><th>Compra</th>{conServicioReporte && <th>Servicio</th>}</tr>
                </thead>
                <tbody>
                  {datos.cupones.slice(0, 300).map((c) => (
                    <tr key={c.id}>
                      <td><button type="button" onClick={() => { setCodigo(c.codigo); window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ border: 'none', background: 'none', color: 'var(--teal-dark)', fontWeight: 700, padding: 0, cursor: 'pointer' }}>{c.codigo}</button></td>
                      <td>{c.cliente_nombre || '—'}{c.cliente_telefono ? <div style={{ color: 'var(--text-secondary)' }}>{c.cliente_telefono}</div> : null}</td>
                      <td>{fecha(c.creado_en)}{c.venta_id ? <div style={{ color: 'var(--text-secondary)' }}>Venta #{c.venta_id}</div> : null}</td>
                      <td>{c.compra_usada_en ? `✅ ${c.compra_donde === 'web' ? 'Página' : 'Tienda'} · ${moneda(c.compra_total)}` : '—'}</td>
                      {conServicioReporte && <td>{c.servicio_usado_en ? `✅ ${moneda(c.servicio_total)}` : '—'}</td>}
                    </tr>
                  ))}
                  {!datos.cupones.length && <tr><td colSpan={5} style={{ color: 'var(--text-secondary)' }}>Todavía no se ha entregado ningún cupón de esta campaña.</td></tr>}
                </tbody>
              </table>
              {datos.cupones.length > 300 && <div className="cp-ayuda">Se muestran los 300 más recientes; el CSV trae todos.</div>}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
