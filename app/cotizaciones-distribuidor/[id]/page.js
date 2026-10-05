'use client';

import { useEffect, useMemo, useState, use as usePromise } from 'react';
import Link from 'next/link';
import Shell from '../../../components/Shell';

// Cotización de un distribuidor (pedido del portal de mayoristas).
// Octubre 2026: ahora se puede
//   - EDITAR mientras está pendiente: cambiar cantidades y precios, quitar
//     productos o agregar otros;
//   - FACTURAR: se revisa (y se puede editar ahí mismo), se elige la bodega
//     de donde sale la mercancía (por defecto Bodega Distribuidor), el medio
//     de pago y el vendedor, y se guarda como VENTA del POS: descuenta el
//     inventario, entra al turno de caja y queda en el Historial.
// "Marcar facturada sin crear venta" sigue disponible para las que ya se
// facturaron aparte.

const moneda = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
const MEDIOS = ['Transferencia', 'Efectivo', 'Tarjeta', 'Otro'];
const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function EditorLineas({ lineas, setLineas, productos, stockDe }) {
  const [buscar, setBuscar] = useState('');
  const resultados = useMemo(() => {
    const q = normalizar(buscar).trim();
    if (q.length < 2) return [];
    const palabras = q.split(/\s+/);
    return productos.filter((p) => palabras.every((w) => normalizar(`${p.referencia} ${p.nombre}`).includes(w))).slice(0, 8);
  }, [buscar, productos]);

  function cambiar(i, campo, valor) {
    setLineas(lineas.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  }
  function agregar(p) {
    const ya = lineas.findIndex((l) => Number(l.producto_id) === Number(p.id));
    if (ya >= 0) cambiar(ya, 'cantidad', String(Number(lineas[ya].cantidad || 0) + 1));
    else
      setLineas([
        ...lineas,
        { producto_id: p.id, referencia: p.referencia, nombre: p.nombre, cantidad: '1', precio_unitario: String(Number(p.precio_distribuidor) || Number(p.precio_venta) || 0) },
      ]);
    setBuscar('');
  }

  return (
    <div>
      <table style={styles.tabla}>
        <thead>
          <tr>
            <th style={styles.th}>Artículo</th>
            {stockDe ? <th style={{ ...styles.th, textAlign: 'center' }}>Stock</th> : null}
            <th style={{ ...styles.th, textAlign: 'center', width: 90 }}>Cant.</th>
            <th style={{ ...styles.th, textAlign: 'right', width: 130 }}>Precio</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Subtotal</th>
            <th style={{ ...styles.th, width: 30 }} />
          </tr>
        </thead>
        <tbody>
          {lineas.map((l, i) => {
            const stock = stockDe ? stockDe(l.producto_id) : null;
            const falta = stock !== null && stock !== undefined && Number(l.cantidad) > stock;
            return (
              <tr key={`${l.producto_id}-${i}`}>
                <td style={styles.td}>
                  <span style={{ color: '#889' }}>{l.referencia}</span> · {l.nombre}
                </td>
                {stockDe ? (
                  <td style={{ ...styles.td, textAlign: 'center', color: falta ? '#b42318' : '#667', fontWeight: falta ? 700 : 400 }}>
                    {stock === null || stock === undefined ? '—' : stock}
                  </td>
                ) : null}
                <td style={{ ...styles.td, textAlign: 'center' }}>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={l.cantidad}
                    onChange={(e) => cambiar(i, 'cantidad', e.target.value)}
                    style={{ ...styles.input, width: 70, textAlign: 'center', borderColor: falta ? '#b42318' : '#ddd' }}
                    aria-label={`Cantidad de ${l.nombre}`}
                  />
                </td>
                <td style={{ ...styles.td, textAlign: 'right' }}>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={l.precio_unitario}
                    onChange={(e) => cambiar(i, 'precio_unitario', e.target.value)}
                    style={{ ...styles.input, width: 110, textAlign: 'right' }}
                    aria-label={`Precio de ${l.nombre}`}
                  />
                </td>
                <td style={{ ...styles.td, textAlign: 'right' }}>{moneda(Number(l.cantidad) * Number(l.precio_unitario))}</td>
                <td style={styles.td}>
                  <button
                    type="button"
                    onClick={() => setLineas(lineas.filter((_, j) => j !== i))}
                    style={styles.quitar}
                    aria-label={`Quitar ${l.nombre}`}
                    title="Quitar"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ position: 'relative', marginTop: 12, maxWidth: 480 }}>
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="+ Agregar producto: busca por nombre o referencia"
          style={{ ...styles.input, width: '100%' }}
        />
        {resultados.length ? (
          <div style={styles.resultados}>
            {resultados.map((p) => (
              <button key={p.id} type="button" onClick={() => agregar(p)} style={styles.resultado}>
                <span>
                  <span style={{ color: '#889' }}>{p.referencia}</span> · {p.nombre}
                </span>
                <span style={{ color: '#667', whiteSpace: 'nowrap' }}>
                  {moneda(Number(p.precio_distribuidor) || Number(p.precio_venta))} · stock {Number(p.stock_distribuidor)} dist. / {Number(p.stock_principal)} ppal.
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function CotizacionDistribuidorPage({ params }) {
  const { id } = usePromise(params);
  const [cotizacion, setCotizacion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [modo, setModo] = useState('ver'); // ver | editar | facturar
  const [lineas, setLineas] = useState([]);
  const [productos, setProductos] = useState([]);
  const [bodegas, setBodegas] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [bodegaId, setBodegaId] = useState('');
  const [medioPago, setMedioPago] = useState('Transferencia');
  const [vendedorId, setVendedorId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  function cargar() {
    setCargando(true);
    return fetch(`/api/cotizaciones-distribuidor/${id}`)
      .then((r) => r.json())
      .then((d) => setCotizacion(d.cotizacion || null))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function abrir(nuevoModo) {
    setError('');
    setAviso('');
    setLineas(
      cotizacion.items.map((it) => ({
        producto_id: it.producto_id,
        referencia: it.referencia,
        nombre: it.nombre,
        cantidad: String(Number(it.cantidad)),
        precio_unitario: String(Number(it.precio_unitario)),
      }))
    );
    setModo(nuevoModo);
    if (!productos.length || (nuevoModo === 'facturar' && !bodegas.length)) {
      const [rp, rb, rv] = await Promise.all([fetch('/api/productos?para=venta'), fetch('/api/bodegas'), fetch('/api/vendedores')]);
      const [dp, db, dv] = await Promise.all([rp.json(), rb.json(), rv.json()]);
      setProductos(dp.productos || []);
      const lista = (db.bodegas || []).filter((b) => b.nombre !== 'Garantías con Proveedor');
      setBodegas(lista);
      setBodegaId((actual) => actual || String((lista.find((b) => b.nombre === 'Bodega Distribuidor') || lista[0] || {}).id || ''));
      setVendedores((dv.vendedores || []).filter((v) => v.activo !== false));
    }
  }

  const sinProductoId = lineas.some((l) => !l.producto_id);
  const total = lineas.reduce((a, l) => a + (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0), 0);
  const bodegaElegida = bodegas.find((b) => String(b.id) === String(bodegaId));
  const stockDe = (productoId) => {
    const p = productos.find((x) => Number(x.id) === Number(productoId));
    if (!p || !bodegaElegida) return null;
    if (p.es_inventariable === false) return null;
    if (bodegaElegida.nombre === 'Bodega Distribuidor') return Number(p.stock_distribuidor);
    if (bodegaElegida.nombre === 'Principal') return Number(p.stock_principal);
    return null;
  };
  const faltaStock =
    modo === 'facturar' &&
    lineas.some((l) => {
      const s = stockDe(l.producto_id);
      return s !== null && Number(l.cantidad) > s;
    });

  function lineasParaEnviar() {
    return lineas.map((l) => ({ producto_id: l.producto_id, cantidad: Number(l.cantidad), precio_unitario: Number(l.precio_unitario) }));
  }

  async function guardarEdicion() {
    setGuardando(true);
    setError('');
    try {
      const res = await fetch(`/api/cotizaciones-distribuidor/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: lineasParaEnviar() }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || 'No se pudo guardar');
      await cargar();
      setModo('ver');
      setAviso('Cotización actualizada.');
    } catch (e) {
      setError(e.message);
    }
    setGuardando(false);
  }

  async function facturar() {
    setGuardando(true);
    setError('');
    try {
      const res = await fetch(`/api/cotizaciones-distribuidor/${id}/facturar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: lineasParaEnviar(),
          bodega_id: Number(bodegaId),
          medio_pago: medioPago,
          vendedor_id: vendedorId ? Number(vendedorId) : null,
        }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || 'No se pudo facturar');
      await cargar();
      setModo('ver');
      setAviso(`Listo: se guardó la venta #${d.ventaId} por ${moneda(d.total)} y se descontó el inventario de ${d.bodega}.`);
    } catch (e) {
      setError(e.message);
    }
    setGuardando(false);
  }

  async function cambiarEstado(estado) {
    setGuardando(true);
    setError('');
    setAviso('');
    const res = await fetch(`/api/cotizaciones-distribuidor/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    });
    const d = await res.json().catch(() => ({}));
    if (!d.ok) setError(d.error || 'No se pudo cambiar el estado');
    await cargar();
    setGuardando(false);
  }

  if (cargando && !cotizacion) {
    return <Shell title="Cotización de distribuidor"><p>Cargando…</p></Shell>;
  }
  if (!cotizacion) {
    return <Shell title="Cotización de distribuidor"><p>No se encontró esta cotización.</p></Shell>;
  }

  const pendiente = cotizacion.estado === 'pendiente';

  return (
    <Shell title={`Cotización ${cotizacion.numero}`}>
      <div style={{ maxWidth: modo === 'ver' ? 680 : 920 }}>
        <div className="pos-no-imprimir" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link href="/cotizaciones-distribuidor" style={styles.botonSecundario}>← Volver</Link>
          {modo === 'ver' ? (
            <>
              {pendiente ? (
                <>
                  <button onClick={() => abrir('facturar')} style={styles.boton}>🧾 Facturar</button>
                  <button onClick={() => abrir('editar')} style={styles.botonSecundario}>✏️ Editar</button>
                </>
              ) : null}
              <button onClick={() => window.print()} style={styles.botonSecundario}>🖨️ Imprimir</button>
              {pendiente ? (
                <button onClick={() => cambiarEstado('facturada')} disabled={guardando} style={styles.botonTexto} title="Para las que ya facturaste por fuera del POS">
                  Marcar facturada sin crear venta
                </button>
              ) : (
                <button onClick={() => cambiarEstado('pendiente')} disabled={guardando} style={styles.botonTexto}>
                  ↺ Volver a pendiente
                </button>
              )}
            </>
          ) : null}
        </div>

        {aviso ? <div className="pos-no-imprimir" style={styles.ok}>{aviso}</div> : null}
        {error ? <div className="pos-no-imprimir" style={styles.error}>{error}</div> : null}

        {modo !== 'ver' ? (
          <div style={styles.hoja}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>
              {modo === 'editar' ? 'Editar cotización' : 'Facturar cotización'} · {cotizacion.distribuidor_nombre}
            </h2>
            {modo === 'facturar' ? (
              <p style={{ color: '#667', marginTop: 0, fontSize: '0.9rem' }}>
                Revisa y ajusta lo que vas a entregar. Al guardar se crea la venta en el POS y se descuenta el inventario de la bodega elegida.
              </p>
            ) : null}
            <EditorLineas lineas={lineas} setLineas={setLineas} productos={productos} stockDe={modo === 'facturar' ? stockDe : null} />

            {modo === 'facturar' ? (
              <div style={styles.camposFactura}>
                <label style={styles.campo}>
                  Sale de la bodega
                  <select value={bodegaId} onChange={(e) => setBodegaId(e.target.value)} style={styles.input}>
                    {bodegas.map((b) => (
                      <option key={b.id} value={b.id}>{b.nombre}</option>
                    ))}
                  </select>
                </label>
                <label style={styles.campo}>
                  Medio de pago
                  <select value={medioPago} onChange={(e) => setMedioPago(e.target.value)} style={styles.input}>
                    {MEDIOS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label style={styles.campo}>
                  Vendedor
                  <select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} style={styles.input}>
                    <option value="">(sin vendedor)</option>
                    {vendedores.map((v) => (
                      <option key={v.id} value={v.id}>{v.nombre}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            {faltaStock ? (
              <p style={{ color: '#b42318', fontSize: '0.9rem' }}>
                Hay productos sin stock suficiente en {bodegaElegida?.nombre}: baja la cantidad, quítalos o elige otra bodega.
              </p>
            ) : null}
            {sinProductoId ? (
              <p style={{ color: '#b42318', fontSize: '0.9rem' }}>Hay productos que ya no existen en el inventario: quítalos para poder guardar.</p>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <span style={{ color: '#667' }}>Total </span>
                <strong style={{ fontSize: '1.3rem' }}>{moneda(total)}</strong>
                {Math.round(total) !== Math.round(Number(cotizacion.total)) ? (
                  <span style={{ color: '#889', fontSize: '0.85rem' }}> (antes {moneda(cotizacion.total)})</span>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => {
                    setModo('ver');
                    setError('');
                  }}
                  disabled={guardando}
                  style={styles.botonSecundario}
                >
                  Cancelar
                </button>
                {modo === 'editar' ? (
                  <button onClick={guardarEdicion} disabled={guardando || !lineas.length || sinProductoId} style={{ ...styles.boton, ...(guardando || !lineas.length || sinProductoId ? styles.deshabilitado : {}) }}>
                    {guardando ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                ) : (
                  <button
                    onClick={facturar}
                    disabled={guardando || !lineas.length || faltaStock || sinProductoId || !bodegaId}
                    style={{ ...styles.boton, ...(guardando || !lineas.length || faltaStock || sinProductoId || !bodegaId ? styles.deshabilitado : {}) }}
                  >
                    {guardando ? 'Guardando…' : `Guardar factura por ${moneda(total)}`}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div style={styles.hoja}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Geek Store</h1>
                <p style={{ color: '#667', margin: '2px 0 0', fontSize: '0.85rem' }}>
                  {cotizacion.venta_id ? `Factura de distribuidor · venta #${cotizacion.venta_id}` : 'Cotización de distribuidor'}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontWeight: 700 }}>{cotizacion.numero}</p>
                <p style={{ margin: 0, color: '#667', fontSize: '0.85rem' }}>{new Date(cotizacion.creado_en).toLocaleString('es-CO')}</p>
                <p style={{ margin: '4px 0 0' }}>
                  <span style={{ color: cotizacion.estado === 'facturada' ? '#067647' : '#b45309', fontWeight: 600 }}>
                    {cotizacion.estado === 'facturada' ? '✓ Facturada' : '⏳ Pendiente'}
                  </span>
                </p>
                {cotizacion.venta?.anulada ? (
                  <p style={{ margin: 0, color: '#b42318', fontSize: '0.85rem' }}>La venta #{cotizacion.venta_id} está anulada</p>
                ) : null}
              </div>
            </div>

            <p style={{ margin: '0 0 16px' }}>
              <strong>Distribuidor:</strong> {cotizacion.distribuidor_nombre} — cédula {cotizacion.distribuidor_cedula}
            </p>

            <table style={styles.tabla}>
              <thead>
                <tr>
                  <th style={styles.th}>Referencia</th>
                  <th style={styles.th}>Artículo</th>
                  <th style={{ ...styles.th, textAlign: 'center' }}>Cant.</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Precio</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {cotizacion.items.map((it) => (
                  <tr key={it.id}>
                    <td style={styles.td}>{it.referencia}</td>
                    <td style={styles.td}>{it.nombre}</td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>{Number(it.cantidad)}</td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>{moneda(it.precio_unitario)}</td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>{moneda(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#667' }}>Total</p>
                <p style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>{moneda(cotizacion.total)}</p>
                {cotizacion.total_original !== null &&
                cotizacion.total_original !== undefined &&
                Math.round(Number(cotizacion.total_original)) !== Math.round(Number(cotizacion.total)) ? (
                  <p className="pos-no-imprimir" style={{ margin: 0, fontSize: '0.8rem', color: '#889' }}>
                    El distribuidor pidió {moneda(cotizacion.total_original)}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

const styles = {
  boton: {
    padding: '8px 14px', borderRadius: 6, border: 'none',
    background: 'var(--teal, #0d9488)', color: '#fff', fontWeight: 600, cursor: 'pointer',
  },
  botonSecundario: {
    padding: '8px 14px', borderRadius: 6, border: '1px solid #ddd', background: '#fff',
    color: '#374', fontWeight: 600, cursor: 'pointer', textDecoration: 'none', fontSize: '0.9rem',
    display: 'inline-flex', alignItems: 'center',
  },
  botonTexto: {
    padding: '8px 6px', border: 'none', background: 'none', color: '#667', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline',
  },
  deshabilitado: { opacity: 0.45, cursor: 'not-allowed' },
  hoja: { background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: 24 },
  tabla: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #eee', color: '#667' },
  td: { padding: '6px 8px', borderBottom: '1px solid #f5f5f5', verticalAlign: 'middle' },
  input: { padding: '7px 9px', borderRadius: 6, border: '1px solid #ddd', fontSize: '0.9rem', boxSizing: 'border-box' },
  quitar: { border: 'none', background: 'none', color: '#b42318', cursor: 'pointer', fontSize: '1rem' },
  resultados: {
    position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 5, background: '#fff', border: '1px solid #ddd',
    borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.1)', maxHeight: 320, overflowY: 'auto',
  },
  resultado: {
    display: 'flex', justifyContent: 'space-between', gap: 10, width: '100%', padding: '8px 10px', border: 'none',
    borderBottom: '1px solid #f3f3f3', background: '#fff', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem',
  },
  camposFactura: { display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18, paddingTop: 14, borderTop: '1px solid #eee' },
  campo: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem', color: '#667', minWidth: 180 },
  ok: { background: '#ecfdf3', border: '1px solid #abefc6', color: '#067647', padding: '10px 12px', borderRadius: 8, marginBottom: 12 },
  error: { background: '#fef3f2', border: '1px solid #fecdca', color: '#b42318', padding: '10px 12px', borderRadius: 8, marginBottom: 12 },
};
