'use client';

import { useMemo, useState } from 'react';

// Editar una factura de compra ya guardada (oct 2026). Se abre desde el
// detalle de la factura (Facturas de compra → la factura → ✏️ Editar).
// Primero "Revisar cambios" muestra qué pasa con el stock y el costo de cada
// producto (sin guardar nada); luego "Guardar cambios". Ver
// app/api/facturas-compra/[id]/editar/route.js.

const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const moneda = (n) => `$${Math.round(Number(n || 0)).toLocaleString('es-CO')}`;
const dia = (d) => (d ? String(d).slice(0, 10) : '');

let siguienteClave = 1;

export default function EditarFacturaCompra({ detalle, productosTodos = [], proveedores = [], onCancelar, onGuardado }) {
  const f = detalle.factura;
  const [enc, setEnc] = useState({
    numero: f.numero || '',
    proveedor_id: f.proveedor_id ? String(f.proveedor_id) : '',
    fecha_creacion: dia(f.fecha_creacion),
    fecha_vencimiento: dia(f.fecha_vencimiento),
    notas: f.notas || '',
  });
  const [lineas, setLineas] = useState(() =>
    (detalle.items || []).map((it) => ({
      clave: siguienteClave++,
      mov_id: it.mov_id,
      producto_id: Number(it.producto_id),
      referencia: it.referencia,
      nombre: it.nombre,
      cantidad: String(Number(it.cantidad)),
      precio: String(Number(it.precio_unitario)),
      descuento_porcentaje: String(Number(it.descuento_porcentaje) || 0),
    }))
  );
  const [buscar, setBuscar] = useState('');
  const [vista, setVista] = useState(null);
  const [revisando, setRevisando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const resultados = useMemo(() => {
    const palabras = sinTildes(buscar).trim().split(/\s+/).filter(Boolean);
    if (!palabras.length) return [];
    return productosTodos
      .filter((p) => p.activo !== false && p.es_inventariable !== false)
      .filter((p) => palabras.every((w) => sinTildes(`${p.nombre} ${p.referencia}`).includes(w)))
      .slice(0, 8);
  }, [buscar, productosTodos]);

  const subtotal = lineas.reduce(
    (a, l) => a + (Number(l.precio) || 0) * (Number(l.cantidad) || 0) * (1 - (Number(l.descuento_porcentaje) || 0) / 100),
    0
  );

  // Cualquier cambio invalida la revisión anterior.
  function tocar() {
    setVista(null);
    setError('');
  }
  function cambiarEnc(campo, valor) {
    tocar();
    setEnc((e) => ({ ...e, [campo]: valor }));
  }
  function cambiarLinea(clave, campo, valor) {
    tocar();
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, [campo]: valor } : l)));
  }
  function quitarLinea(clave) {
    tocar();
    setLineas((ls) => ls.filter((l) => l.clave !== clave));
  }
  function agregar(p) {
    tocar();
    setLineas((ls) => [
      ...ls,
      {
        clave: siguienteClave++,
        mov_id: null,
        producto_id: Number(p.id),
        referencia: p.referencia,
        nombre: p.nombre,
        cantidad: '1',
        precio: p.precio_costo ? String(Math.round(Number(p.precio_costo))) : '',
        descuento_porcentaje: '0',
      },
    ]);
    setBuscar('');
  }

  function cuerpo(aplicar) {
    return {
      aplicar,
      ...enc,
      proveedor_id: Number(enc.proveedor_id),
      items: lineas.map((l) => ({
        mov_id: l.mov_id,
        producto_id: l.producto_id,
        cantidad: Number(l.cantidad),
        precio: Number(l.precio),
        descuento_porcentaje: Number(l.descuento_porcentaje) || 0,
      })),
    };
  }

  async function enviar(aplicar) {
    setError('');
    aplicar ? setGuardando(true) : setRevisando(true);
    try {
      const res = await fetch(`/api/facturas-compra/${detalle.id}/editar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo(aplicar)),
      });
      const d = await res.json();
      if (d.vista) {
        setVista(d.vista);
        // Que se vea el resultado de la revisión (queda abajo del formulario).
        setTimeout(() => document.querySelector('.efc-vista')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
      }
      if (!d.ok) return setError(d.error || 'No se pudo');
      if (aplicar) onGuardado?.(d.vista);
    } catch {
      setError('Error de conexión');
    } finally {
      setGuardando(false);
      setRevisando(false);
    }
  }

  const t = vista?.totales;
  const sinCambiosInventario = vista && vista.resumen.length === 0;

  return (
    <div className="efc">
      <style>{`
        .efc label { display: block; font-size: 12px; color: var(--text-secondary); margin: 8px 0 4px; }
        .efc input, .efc select, .efc textarea { width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border); font-size: 14px; background: #fff; }
        .efc-g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .efc-linea { border: 1px solid var(--border); border-radius: 10px; padding: 10px; margin-top: 8px; }
        .efc-linea-cab { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; font-size: 14px; }
        .efc-linea-cab small { display: block; color: var(--text-secondary); font-size: 12px; }
        .efc-linea-campos { display: grid; grid-template-columns: 90px 1fr 80px 1fr; gap: 8px; align-items: end; margin-top: 6px; }
        .efc-linea-campos label { margin: 0 0 3px; }
        .efc-sub { text-align: right; font-weight: 700; font-size: 14px; padding-bottom: 8px; }
        .efc-nueva { display: inline-block; font-size: 11px; font-weight: 700; color: var(--teal-dark); background: var(--teal-light); border-radius: 999px; padding: 1px 8px; margin-left: 6px; }
        .efc-quitar { border: 1px solid var(--border); background: #fff; color: var(--danger); border-radius: 6px; padding: 4px 9px; font-size: 12px; cursor: pointer; white-space: nowrap; }
        .efc-drop { border: 1px solid var(--border); border-radius: 8px; margin-top: 4px; max-height: 260px; overflow: auto; background: #fff; }
        .efc-drop button { display: block; width: 100%; text-align: left; border: none; border-bottom: 1px solid var(--border); background: #fff; padding: 9px 10px; font-size: 14px; cursor: pointer; }
        .efc-drop button small { color: var(--text-secondary); }
        .efc-total { display: flex; justify-content: space-between; font-weight: 700; font-size: 15px; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border); }
        .efc-vista { margin-top: 12px; border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; background: #f8fafc; font-size: 13px; }
        .efc-vista table { width: 100%; border-collapse: collapse; }
        .efc-vista th { text-align: left; color: var(--text-secondary); font-weight: 600; padding: 4px; border-bottom: 1px solid var(--border); }
        .efc-vista td { padding: 6px 4px; border-bottom: 1px solid var(--border); vertical-align: top; }
        .efc-err { color: var(--danger); font-size: 13px; margin: 8px 0 0; }
        .efc-aviso { color: #93370d; }
        .efc-botones { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
        .efc-btn { padding: 9px 16px; border-radius: 8px; border: none; background: var(--teal); color: #fff; cursor: pointer; font-weight: 600; font-size: 14px; }
        .efc-btn:disabled { opacity: .5; cursor: default; }
        .efc-sec { padding: 9px 16px; border-radius: 8px; border: 1px solid var(--border); background: #fff; cursor: pointer; font-size: 14px; }
        @media (max-width: 560px) {
          .efc-g2 { grid-template-columns: 1fr; }
          .efc-linea-campos { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      <div className="efc-g2">
        <div>
          <label>Número de factura</label>
          <input value={enc.numero} onChange={(e) => cambiarEnc('numero', e.target.value)} placeholder="FE-1234" />
        </div>
        <div>
          <label>Proveedor</label>
          <select value={enc.proveedor_id} onChange={(e) => cambiarEnc('proveedor_id', e.target.value)}>
            {!enc.proveedor_id && <option value="">Elige el proveedor</option>}
            {proveedores.map((p) => (
              <option key={p.id} value={String(p.id)}>{p.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Fecha de creación</label>
          <input type="date" value={enc.fecha_creacion} onChange={(e) => cambiarEnc('fecha_creacion', e.target.value)} />
        </div>
        <div>
          <label>Vencimiento</label>
          <input type="date" value={enc.fecha_vencimiento} onChange={(e) => cambiarEnc('fecha_vencimiento', e.target.value)} />
        </div>
      </div>
      <label>Bodega</label>
      <div style={{ fontSize: '14px' }}>{f.bodega_nombre} <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>(no se cambia)</span></div>

      <label style={{ marginTop: '14px' }}>Productos</label>
      {lineas.map((l) => {
        const sub = (Number(l.precio) || 0) * (Number(l.cantidad) || 0) * (1 - (Number(l.descuento_porcentaje) || 0) / 100);
        return (
          <div className="efc-linea" key={l.clave}>
            <div className="efc-linea-cab">
              <div>
                {l.nombre}
                {!l.mov_id && <span className="efc-nueva">nueva</span>}
                <small>{l.referencia}</small>
              </div>
              <button type="button" className="efc-quitar" onClick={() => quitarLinea(l.clave)} aria-label={`Quitar ${l.nombre}`}>✕ Quitar</button>
            </div>
            <div className="efc-linea-campos">
              <div>
                <label>Cantidad</label>
                <input type="number" min="1" step="1" inputMode="numeric" value={l.cantidad} onChange={(e) => cambiarLinea(l.clave, 'cantidad', e.target.value)} aria-label={`Cantidad ${l.nombre}`} />
              </div>
              <div>
                <label>Costo unitario</label>
                <input type="number" min="0" inputMode="decimal" value={l.precio} onChange={(e) => cambiarLinea(l.clave, 'precio', e.target.value)} aria-label={`Costo ${l.nombre}`} />
              </div>
              <div>
                <label>Desc. %</label>
                <input type="number" min="0" max="99" inputMode="decimal" value={l.descuento_porcentaje} onChange={(e) => cambiarLinea(l.clave, 'descuento_porcentaje', e.target.value)} aria-label={`Descuento ${l.nombre}`} />
              </div>
              <div className="efc-sub">{moneda(sub)}</div>
            </div>
          </div>
        );
      })}

      <label style={{ marginTop: '12px' }}>Agregar producto</label>
      <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre o referencia" />
      {resultados.length > 0 && (
        <div className="efc-drop">
          {resultados.map((p) => (
            <button type="button" key={p.id} onClick={() => agregar(p)}>
              {p.nombre} <small>· {p.referencia}</small>
            </button>
          ))}
        </div>
      )}

      <label style={{ marginTop: '12px' }}>Notas</label>
      <textarea rows={2} value={enc.notas} onChange={(e) => cambiarEnc('notas', e.target.value)} />

      <div className="efc-total"><span>Subtotal</span><span>{moneda(subtotal)}</span></div>

      {vista && (
        <div className="efc-vista">
          <strong>Así quedaría</strong>
          {sinCambiosInventario ? (
            <p style={{ margin: '6px 0 0' }}>No cambia el stock ni el costo de ningún producto.</p>
          ) : (
            <table style={{ marginTop: '6px' }}>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Stock bodega</th>
                  <th>Costo</th>
                </tr>
              </thead>
              <tbody>
                {vista.resumen.map((r) => (
                  <tr key={r.producto_id}>
                    <td>
                      {r.referencia} · {r.nombre}
                      {r.cantidad_antes !== r.cantidad_despues && (
                        <div style={{ color: 'var(--text-secondary)' }}>En la factura: {r.cantidad_antes} → {r.cantidad_despues}</div>
                      )}
                      {r.ventas_corregidas > 0 && (
                        <div style={{ color: 'var(--text-secondary)' }}>También corrige el costo de {r.ventas_corregidas} venta(s) hechas después.</div>
                      )}
                      {r.aviso && <div className="efc-aviso">{r.aviso}</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: r.stock_bodega_despues < 0 ? 'var(--danger)' : undefined }}>
                      {r.stock_bodega_antes} → <strong>{r.stock_bodega_despues}</strong>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {r.recalcula_costo ? (
                        <>{moneda(r.costo_actual)} → <strong>{moneda(r.costo_nuevo)}</strong></>
                      ) : (
                        <>{moneda(r.costo_actual)}{r.aviso ? '' : ' (igual)'}</>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ marginTop: '8px' }}>
            Subtotal: {moneda(t.subtotal_antes)} → <strong>{moneda(t.subtotal_despues)}</strong>
            {t.retencion_actualizada && <> · ReteICA: {moneda(t.retencion_antes)} → <strong>{moneda(t.retencion_despues)}</strong></>}
          </div>
          {t.pagada && Math.round(t.subtotal_antes) !== Math.round(t.subtotal_despues) && (
            <div className="efc-aviso" style={{ marginTop: '6px' }}>Esta factura ya está marcada como pagada: revisa que el pago al proveedor cuadre con el nuevo total.</div>
          )}
          {vista.errores.map((e) => (
            <p key={e} className="efc-err">⛔ {e}</p>
          ))}
        </div>
      )}

      {error && !vista?.errores?.length && <p className="efc-err">{error}</p>}

      <div className="efc-botones">
        {!vista ? (
          <button type="button" className="efc-btn" onClick={() => enviar(false)} disabled={revisando || !lineas.length}>
            {revisando ? 'Revisando…' : 'Revisar cambios'}
          </button>
        ) : (
          <button type="button" className="efc-btn" onClick={() => enviar(true)} disabled={guardando || vista.errores.length > 0}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        )}
        <button type="button" className="efc-sec" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}
