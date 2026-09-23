'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '../../../components/Shell';

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

const formVacio = {
  numero: '',
  proveedor_id: '',
  bodega_id: '',
  fecha_creacion: hoyISO(),
  fecha_vencimiento: '',
  retencion_porcentaje: 0,
  notas: '',
};

const proveedorVacio = { nombre: '', identificacion: '', telefono: '' };

export default function FacturasCompraPage() {
  const [facturas, setFacturas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [proveedores, setProveedores] = useState([]);
  const [bodegas, setBodegas] = useState([]);
  const [productosTodos, setProductosTodos] = useState([]);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(formVacio);
  const [items, setItems] = useState([]); // [{producto_id, referencia, nombre, cantidad, precio, descuento_porcentaje}]
  const [buscarTexto, setBuscarTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const [mostrarNuevoProveedor, setMostrarNuevoProveedor] = useState(false);
  const [nuevoProveedor, setNuevoProveedor] = useState(proveedorVacio);
  const [guardandoProveedor, setGuardandoProveedor] = useState(false);

  const [detalleFactura, setDetalleFactura] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [pagandoId, setPagandoId] = useState(null);

  const [editandoRetencion, setEditandoRetencion] = useState(false);
  const [retForm, setRetForm] = useState({ retencion_porcentaje: 0, retencion_base: 0, retencion_valor: 0 });
  const [guardandoRetencion, setGuardandoRetencion] = useState(false);
  const [errorRetencion, setErrorRetencion] = useState('');

  async function cargarFacturas() {
    setCargando(true);
    try {
      const res = await fetch('/api/facturas-compra');
      const data = await res.json();
      if (data.ok) setFacturas(data.facturas);
      else setError(data.error || 'No se pudieron cargar las facturas de compra');
    } catch {
      setError('No se pudieron cargar las facturas de compra');
    } finally {
      setCargando(false);
    }
  }

  async function cargarProveedores() {
    const res = await fetch('/api/proveedores');
    const data = await res.json();
    if (data.ok) setProveedores(data.proveedores);
  }

  async function cargarBodegas() {
    const res = await fetch('/api/bodegas');
    const data = await res.json();
    if (data.ok) setBodegas(data.bodegas);
  }

  async function cargarProductos() {
    const res = await fetch('/api/productos');
    const data = await res.json();
    if (data.ok) setProductosTodos(data.productos);
  }

  useEffect(() => {
    cargarFacturas();
    cargarProveedores();
    cargarBodegas();
    cargarProductos();
  }, []);

  const resultadosBusqueda = useMemo(() => {
    const texto = buscarTexto.trim().toLowerCase();
    if (!texto) return [];
    return productosTodos
      .filter((p) => p.activo !== false && p.es_inventariable !== false)
      .filter(
        (p) => (p.nombre || '').toLowerCase().includes(texto) || (p.referencia || '').toLowerCase().includes(texto)
      )
      .slice(0, 8);
  }, [buscarTexto, productosTodos]);

  function abrirForm() {
    setForm(formVacio);
    setItems([]);
    setBuscarTexto('');
    setErrorForm('');
    setMostrarNuevoProveedor(false);
    setNuevoProveedor(proveedorVacio);
    setMostrarForm(true);
  }

  function cerrarForm() {
    setMostrarForm(false);
  }

  function agregarItem(producto) {
    setItems((actual) => {
      const yaEsta = actual.find((it) => it.producto_id === producto.id);
      if (yaEsta) {
        return actual.map((it) => (it.producto_id === producto.id ? { ...it, cantidad: it.cantidad + 1 } : it));
      }
      return [
        ...actual,
        {
          producto_id: producto.id,
          referencia: producto.referencia,
          nombre: producto.nombre,
          cantidad: 1,
          precio: Number(producto.precio_costo) || '',
          descuento_porcentaje: 0,
        },
      ];
    });
    setBuscarTexto('');
  }

  function actualizarItem(productoId, campo, valor) {
    setItems((actual) =>
      actual.map((it) => (it.producto_id === productoId ? { ...it, [campo]: valor } : it))
    );
  }

  function quitarItem(productoId) {
    setItems((actual) => actual.filter((it) => it.producto_id !== productoId));
  }

  const subtotal = useMemo(
    () =>
      items.reduce((acc, it) => {
        const precio = Number(it.precio) || 0;
        const cantidad = Number(it.cantidad) || 0;
        const descuento = Number(it.descuento_porcentaje) || 0;
        return acc + precio * cantidad * (1 - descuento / 100);
      }, 0),
    [items]
  );
  const retencionValor = useMemo(
    () => subtotal * (Number(form.retencion_porcentaje) / 100),
    [subtotal, form.retencion_porcentaje]
  );
  const totalFactura = subtotal;
  const porPagar = totalFactura - retencionValor;

  async function crearProveedor() {
    setErrorForm('');
    if (!nuevoProveedor.nombre.trim()) {
      setErrorForm('Escribe el nombre del proveedor');
      return;
    }
    setGuardandoProveedor(true);
    try {
      const res = await fetch('/api/proveedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevoProveedor),
      });
      const data = await res.json();
      if (!data.ok) {
        setErrorForm(data.error || 'No se pudo crear el proveedor');
        return;
      }
      setProveedores((actual) => [...actual, data.proveedor].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setForm((f) => ({ ...f, proveedor_id: String(data.proveedor.id) }));
      setMostrarNuevoProveedor(false);
      setNuevoProveedor(proveedorVacio);
    } catch {
      setErrorForm('No se pudo crear el proveedor');
    } finally {
      setGuardandoProveedor(false);
    }
  }

  async function guardarFactura() {
    setErrorForm('');
    if (!form.proveedor_id) {
      setErrorForm('Selecciona el proveedor');
      return;
    }
    if (!form.bodega_id) {
      setErrorForm('Selecciona la bodega que recibe la mercancía');
      return;
    }
    if (items.length === 0) {
      setErrorForm('Agrega al menos un producto');
      return;
    }
    const itemInvalido = items.find((it) => !it.cantidad || it.cantidad <= 0 || !it.precio || it.precio <= 0);
    if (itemInvalido) {
      setErrorForm(`Revisa la cantidad y el precio de "${itemInvalido.nombre}"`);
      return;
    }

    setGuardando(true);
    try {
      const res = await fetch('/api/facturas-compra', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numero: form.numero,
          proveedor_id: Number(form.proveedor_id),
          bodega_id: Number(form.bodega_id),
          fecha_creacion: form.fecha_creacion,
          fecha_vencimiento: form.fecha_vencimiento || null,
          retencion_porcentaje: Number(form.retencion_porcentaje),
          notas: form.notas,
          items: items.map((it) => ({
            producto_id: it.producto_id,
            cantidad: Number(it.cantidad),
            precio: Number(it.precio),
            descuento_porcentaje: Number(it.descuento_porcentaje) || 0,
          })),
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErrorForm(data.error || 'No se pudo guardar la factura de compra');
        return;
      }
      setMostrarForm(false);
      cargarFacturas();
      cargarProductos();
    } catch {
      setErrorForm('No se pudo guardar la factura de compra');
    } finally {
      setGuardando(false);
    }
  }

  async function abrirDetalle(id) {
    setCargandoDetalle(true);
    setDetalleFactura({ id });
    setEditandoRetencion(false);
    setErrorRetencion('');
    try {
      const res = await fetch(`/api/facturas-compra/${id}`);
      const data = await res.json();
      if (data.ok) setDetalleFactura(data);
      else setDetalleFactura(null);
    } catch {
      setDetalleFactura(null);
    } finally {
      setCargandoDetalle(false);
    }
  }

  function cerrarDetalle() {
    setDetalleFactura(null);
    setEditandoRetencion(false);
  }

  // Abre el formulario de "Agregar/editar retención" (como en Alegra:
  // "Más acciones" → "Agregar retenciones"), con los valores actuales de la
  // factura ya puestos, o en ceros si todavía no tenía retención.
  function abrirEditarRetencion() {
    const f = detalleFactura?.factura;
    setRetForm({
      retencion_porcentaje: Number(f?.retencion_porcentaje) || 0,
      retencion_base: Number(f?.retencion_base ?? f?.subtotal) || 0,
      retencion_valor: Number(f?.retencion_valor) || 0,
    });
    setErrorRetencion('');
    setEditandoRetencion(true);
  }

  // Al cambiar la tarifa o la base, se sugiere el Valor recalculado
  // (base × tarifa), pero se puede seguir editando el Valor a mano después.
  function actualizarRetForm(campo, valor) {
    setRetForm((actual) => {
      const siguiente = { ...actual, [campo]: valor };
      if (campo === 'retencion_porcentaje' || campo === 'retencion_base') {
        const base = Number(campo === 'retencion_base' ? valor : actual.retencion_base) || 0;
        const pct = Number(campo === 'retencion_porcentaje' ? valor : actual.retencion_porcentaje) || 0;
        siguiente.retencion_valor = Math.round(base * (pct / 100));
      }
      return siguiente;
    });
  }

  async function guardarRetencion() {
    if (!detalleFactura?.factura) return;
    setErrorRetencion('');
    setGuardandoRetencion(true);
    try {
      const res = await fetch(`/api/facturas-compra/${detalleFactura.id}/retencion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(retForm),
      });
      const data = await res.json();
      if (!data.ok) {
        setErrorRetencion(data.error || 'No se pudo guardar la retención');
        return;
      }
      setEditandoRetencion(false);
      await abrirDetalle(detalleFactura.id);
      cargarFacturas();
    } catch {
      setErrorRetencion('No se pudo guardar la retención');
    } finally {
      setGuardandoRetencion(false);
    }
  }

  async function marcarPagada(id) {
    setPagandoId(id);
    try {
      const res = await fetch(`/api/facturas-compra/${id}/pagar`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) cargarFacturas();
    } finally {
      setPagandoId(null);
    }
  }

  function moneda(n) {
    return Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
  }
  function fecha(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-CO');
  }

  return (
    <Shell title="Facturas de compra">
      <div style={styles.header}>
        <h2 style={{ margin: 0 }}>Facturas de compra</h2>
        <button onClick={abrirForm} style={styles.btnPrimario}>+ Nueva factura de compra</button>
      </div>

      {cargando ? (
        <p>Cargando...</p>
      ) : error ? (
        <p style={{ color: 'var(--danger)' }}>{error}</p>
      ) : (
        <div style={styles.tableCard}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={styles.th}>Número</th>
                <th style={styles.th}>Proveedor</th>
                <th style={styles.th}>Creación</th>
                <th style={styles.th}>Vencimiento</th>
                <th style={styles.th}>Total</th>
                <th style={styles.th}>Retención</th>
                <th style={styles.th}>Por pagar</th>
                <th style={styles.th}>Estado</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {facturas.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ ...styles.td, color: 'var(--text-secondary)' }}>
                    Todavía no has registrado ninguna factura de compra.
                  </td>
                </tr>
              )}
              {facturas.map((f) => (
                <tr key={f.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={styles.td}>
                    <span onClick={() => abrirDetalle(f.id)} style={styles.clicable}>{f.numero || `FC-${f.id}`}</span>
                  </td>
                  <td style={styles.td}>{f.proveedor_nombre}</td>
                  <td style={styles.td}>{fecha(f.fecha_creacion)}</td>
                  <td style={styles.td}>{fecha(f.fecha_vencimiento)}</td>
                  <td style={styles.td}>${moneda(f.total)}</td>
                  <td style={styles.td}>
                    {Number(f.retencion_porcentaje) > 0 ? `${f.retencion_porcentaje}% (-$${moneda(f.retencion_valor)})` : '—'}
                  </td>
                  <td style={styles.td}>${moneda(f.por_pagar)}</td>
                  <td style={styles.td}>
                    <span style={f.estado_pago === 'pagada' ? styles.chipPagada : styles.chipPendiente}>
                      {f.estado_pago === 'pagada' ? 'Pagada' : 'Pendiente'}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {f.estado_pago === 'pendiente' && (
                      <button onClick={() => marcarPagada(f.id)} disabled={pagandoId === f.id} style={styles.btnSecundario}>
                        {pagandoId === f.id ? 'Marcando...' : 'Marcar pagada'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mostrarForm && (
        <div style={styles.overlay} onMouseDown={cerrarForm}>
          <div style={{ ...styles.formCard, ...styles.formModal }} onMouseDown={(e) => e.stopPropagation()}>
            <div style={styles.header}>
              <h3 style={{ margin: 0 }}>Nueva factura de compra</h3>
              <button onClick={cerrarForm} style={styles.btnCerrarModal}>✕</button>
            </div>

            <div style={styles.grid2}>
              <div>
                <label style={styles.etiquetaChica}>Bodega que recibe *</label>
                <select
                  value={form.bodega_id}
                  onChange={(e) => setForm({ ...form, bodega_id: e.target.value })}
                  style={styles.select}
                >
                  <option value="">Selecciona...</option>
                  {bodegas.map((b) => (
                    <option key={b.id} value={b.id}>{b.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={styles.etiquetaChica}>No. de factura (opcional)</label>
                <input
                  value={form.numero}
                  onChange={(e) => setForm({ ...form, numero: e.target.value })}
                  placeholder="Ej: FE-1234"
                  style={styles.select}
                />
              </div>
            </div>

            <div style={{ marginTop: '12px' }}>
              <label style={styles.etiquetaChica}>Proveedor *</label>
              {!mostrarNuevoProveedor ? (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <select
                    value={form.proveedor_id}
                    onChange={(e) => setForm({ ...form, proveedor_id: e.target.value })}
                    style={{ ...styles.select, flex: 1 }}
                  >
                    <option value="">Selecciona...</option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setMostrarNuevoProveedor(true)} style={styles.btnMiniLink}>
                    + Nuevo proveedor
                  </button>
                </div>
              ) : (
                <div style={styles.cajaNuevoProveedor}>
                  <input
                    value={nuevoProveedor.nombre}
                    onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, nombre: e.target.value })}
                    placeholder="Nombre del proveedor *"
                    style={{ ...styles.select, width: '100%', marginBottom: '8px' }}
                  />
                  <div style={styles.grid2}>
                    <input
                      value={nuevoProveedor.identificacion}
                      onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, identificacion: e.target.value })}
                      placeholder="Identificación (NIT/CC)"
                      style={styles.select}
                    />
                    <input
                      value={nuevoProveedor.telefono}
                      onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, telefono: e.target.value })}
                      placeholder="Teléfono"
                      style={styles.select}
                    />
                  </div>
                  <div style={{ marginTop: '8px' }}>
                    <button type="button" onClick={crearProveedor} disabled={guardandoProveedor} style={styles.btnPrimario}>
                      {guardandoProveedor ? 'Creando...' : 'Crear proveedor'}
                    </button>
                    <button type="button" onClick={() => setMostrarNuevoProveedor(false)} style={styles.btnSecundario}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ ...styles.grid2, marginTop: '12px' }}>
              <div>
                <label style={styles.etiquetaChica}>Creación *</label>
                <input
                  type="date"
                  value={form.fecha_creacion}
                  onChange={(e) => setForm({ ...form, fecha_creacion: e.target.value })}
                  style={styles.select}
                />
              </div>
              <div>
                <label style={styles.etiquetaChica}>Vencimiento (opcional)</label>
                <input
                  type="date"
                  value={form.fecha_vencimiento}
                  onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })}
                  style={styles.select}
                />
              </div>
            </div>

            <div style={{ position: 'relative', marginTop: '16px' }}>
              <label style={styles.etiquetaChica}>Agregar producto</label>
              <input
                value={buscarTexto}
                onChange={(e) => setBuscarTexto(e.target.value)}
                placeholder="Buscar por nombre o referencia..."
                style={{ ...styles.select, width: '100%' }}
              />
              {resultadosBusqueda.length > 0 && (
                <div style={styles.dropdownBusqueda}>
                  {resultadosBusqueda.map((p) => (
                    <div key={p.id} style={styles.opcionBusqueda} onClick={() => agregarItem(p)}>
                      <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '12px', marginLeft: '8px' }}>{p.referencia}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {items.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', marginTop: '12px' }}>Todavía no has agregado productos.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                    <th style={styles.th}>Producto</th>
                    <th style={styles.th}>Precio</th>
                    <th style={styles.th}>Desc %</th>
                    <th style={styles.th}>Cantidad</th>
                    <th style={styles.th}>Subtotal</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const sub = (Number(it.precio) || 0) * (Number(it.cantidad) || 0) * (1 - (Number(it.descuento_porcentaje) || 0) / 100);
                    return (
                      <tr key={it.producto_id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={styles.td}>
                          <div style={{ fontWeight: 600 }}>{it.nombre}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{it.referencia}</div>
                        </td>
                        <td style={styles.td}>
                          <input
                            type="number"
                            min="0"
                            value={it.precio}
                            onChange={(e) => actualizarItem(it.producto_id, 'precio', e.target.value)}
                            style={styles.inputCantidad}
                          />
                        </td>
                        <td style={styles.td}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={it.descuento_porcentaje}
                            onChange={(e) => actualizarItem(it.producto_id, 'descuento_porcentaje', e.target.value)}
                            style={styles.inputCantidad}
                          />
                        </td>
                        <td style={styles.td}>
                          <input
                            type="number"
                            min="1"
                            value={it.cantidad}
                            onChange={(e) => actualizarItem(it.producto_id, 'cantidad', e.target.value)}
                            style={styles.inputCantidad}
                          />
                        </td>
                        <td style={styles.td}>${moneda(sub)}</td>
                        <td style={styles.td}>
                          <button onClick={() => quitarItem(it.producto_id)} style={styles.btnQuitar}>Quitar</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <div style={styles.resumenFactura}>
              <div style={styles.filaResumen}><span>Subtotal</span><span>${moneda(subtotal)}</span></div>
              <div style={styles.filaResumen}>
                <span>Retención (ReteICA)</span>
                <select
                  value={form.retencion_porcentaje}
                  onChange={(e) => setForm({ ...form, retencion_porcentaje: e.target.value })}
                  style={styles.selectChico}
                >
                  <option value={0}>Sin retención</option>
                  <option value={1.1}>1.1%</option>
                  <option value={0.41}>0.41%</option>
                </select>
              </div>
              {retencionValor > 0 && (
                <div style={styles.filaResumen}><span></span><span>-${moneda(retencionValor)}</span></div>
              )}
              <div style={{ ...styles.filaResumen, fontWeight: 700 }}><span>Total</span><span>${moneda(totalFactura)}</span></div>
              <div style={{ ...styles.filaResumen, fontWeight: 700, color: 'var(--teal-dark)' }}>
                <span>Por pagar al proveedor</span><span>${moneda(porPagar)}</span>
              </div>
            </div>

            <div style={{ marginTop: '12px' }}>
              <label style={styles.etiquetaChica}>Notas (opcional)</label>
              <textarea
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                rows={2}
                style={{ ...styles.select, width: '100%', resize: 'vertical' }}
              />
            </div>

            {errorForm && <p style={{ color: 'var(--danger)' }}>{errorForm}</p>}

            <div style={{ marginTop: '14px' }}>
              <button onClick={guardarFactura} disabled={guardando} style={styles.btnPrimario}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
              <button onClick={cerrarForm} style={styles.btnSecundario}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {detalleFactura && (
        <div style={styles.overlay} onMouseDown={cerrarDetalle}>
          <div style={styles.modalDetalle} onMouseDown={(e) => e.stopPropagation()}>
            <div style={styles.header}>
              <h3 style={{ margin: 0 }}>{detalleFactura.factura?.numero || `FC-${detalleFactura.id}`}</h3>
              <button onClick={cerrarDetalle} style={styles.btnCerrarModal}>✕</button>
            </div>
            {cargandoDetalle ? (
              <p>Cargando...</p>
            ) : !detalleFactura.factura ? (
              <p style={{ color: 'var(--danger)' }}>No se pudo cargar el detalle.</p>
            ) : (
              <>
                <div style={styles.filaDetalle}><span>Proveedor</span><strong>{detalleFactura.factura.proveedor_nombre}</strong></div>
                <div style={styles.filaDetalle}><span>Bodega</span><strong>{detalleFactura.factura.bodega_nombre}</strong></div>
                <div style={styles.filaDetalle}><span>Creación</span><strong>{fecha(detalleFactura.factura.fecha_creacion)}</strong></div>
                <div style={styles.filaDetalle}><span>Vencimiento</span><strong>{fecha(detalleFactura.factura.fecha_vencimiento)}</strong></div>

                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      <th style={styles.th}>Producto</th>
                      <th style={styles.th}>Cant.</th>
                      <th style={styles.th}>Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalleFactura.items?.map((it, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={styles.td}>{it.nombre}<div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{it.referencia}</div></td>
                        <td style={styles.td}>{it.cantidad}</td>
                        <td style={styles.td}>${moneda(it.precio_unitario)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ ...styles.resumenFactura, marginTop: '12px' }}>
                  <div style={styles.filaResumen}><span>Subtotal</span><span>${moneda(detalleFactura.factura.subtotal)}</span></div>
                  <div style={styles.filaResumen}>
                    <span>Retención {Number(detalleFactura.factura.retencion_porcentaje) > 0 ? `(${detalleFactura.factura.retencion_porcentaje}% sobre $${moneda(detalleFactura.factura.retencion_base)})` : ''}</span>
                    <span>-${moneda(detalleFactura.factura.retencion_valor)}</span>
                  </div>
                  <div style={{ ...styles.filaResumen, fontWeight: 700 }}><span>Total</span><span>${moneda(detalleFactura.factura.total)}</span></div>
                  <div style={{ ...styles.filaResumen, fontWeight: 700, color: 'var(--teal-dark)' }}>
                    <span>Por pagar</span><span>${moneda(detalleFactura.factura.por_pagar)}</span>
                  </div>
                </div>

                {detalleFactura.factura.estado_pago === 'pagada' ? (
                  <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Esta factura ya está pagada, por eso no se puede editar la retención.
                  </p>
                ) : !editandoRetencion ? (
                  <button type="button" onClick={abrirEditarRetencion} style={styles.btnMiniLink}>
                    {Number(detalleFactura.factura.retencion_porcentaje) > 0 ? 'Editar retención' : '+ Agregar retención'}
                  </button>
                ) : (
                  <div style={styles.cajaNuevoProveedor}>
                    <label style={styles.etiquetaChica}>Retención</label>
                    <select
                      value={retForm.retencion_porcentaje}
                      onChange={(e) => actualizarRetForm('retencion_porcentaje', Number(e.target.value))}
                      style={{ ...styles.select, width: '100%', marginBottom: '8px' }}
                    >
                      <option value={0}>Sin retención</option>
                      <option value={1.1}>ReteICA 1.1%</option>
                      <option value={0.41}>ReteICA 0.41%</option>
                    </select>
                    <div style={styles.grid2}>
                      <div>
                        <label style={styles.etiquetaChica}>Base</label>
                        <input
                          type="number"
                          min="0"
                          value={retForm.retencion_base}
                          onChange={(e) => actualizarRetForm('retencion_base', Number(e.target.value))}
                          style={{ ...styles.select, width: '100%' }}
                        />
                      </div>
                      <div>
                        <label style={styles.etiquetaChica}>Valor</label>
                        <input
                          type="number"
                          min="0"
                          value={retForm.retencion_valor}
                          onChange={(e) => actualizarRetForm('retencion_valor', Number(e.target.value))}
                          style={{ ...styles.select, width: '100%' }}
                        />
                      </div>
                    </div>
                    {errorRetencion && <p style={{ color: 'var(--danger)', fontSize: '13px' }}>{errorRetencion}</p>}
                    <div style={{ marginTop: '8px' }}>
                      <button type="button" onClick={guardarRetencion} disabled={guardandoRetencion} style={styles.btnPrimario}>
                        {guardandoRetencion ? 'Guardando...' : 'Guardar retención'}
                      </button>
                      <button type="button" onClick={() => setEditandoRetencion(false)} style={styles.btnSecundario}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {detalleFactura.factura.notas && (
                  <p style={{ marginTop: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>{detalleFactura.factura.notas}</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  tableCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 16px' },
  th: { padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)' },
  td: { padding: '10px 8px', fontSize: '14px' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  btnSecundario: { padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', marginLeft: '8px', cursor: 'pointer' },
  btnQuitar: { padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '12px', color: 'var(--danger)' },
  btnMiniLink: { border: 'none', background: 'none', color: 'var(--teal-dark)', cursor: 'pointer', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap' },
  clicable: { cursor: 'pointer', color: 'var(--teal-dark)', fontWeight: 600 },
  chipPendiente: { padding: '3px 10px', borderRadius: '999px', background: '#fef3c7', color: '#92400e', fontSize: '12px', fontWeight: 600 },
  chipPagada: { padding: '3px 10px', borderRadius: '999px', background: 'var(--teal-light)', color: 'var(--teal-dark)', fontSize: '12px', fontWeight: 600 },
  etiquetaChica: { display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' },
  select: { padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', boxSizing: 'border-box' },
  selectChico: { padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  inputCantidad: { width: '80px', padding: '7px', borderRadius: '6px', border: '1px solid var(--border)' },
  cajaNuevoProveedor: { border: '1px dashed var(--border)', borderRadius: '8px', padding: '10px', marginTop: '4px' },
  dropdownBusqueda: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    zIndex: 20,
    maxHeight: '220px',
    overflowY: 'auto',
  },
  opcionBusqueda: { padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)' },
  resumenFactura: { marginTop: '14px', borderTop: '1px solid var(--border)', paddingTop: '10px' },
  filaResumen: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '14px' },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  formCard: { background: '#fff', border: '1px solid var(--border)', padding: '20px', borderRadius: 'var(--radius)' },
  formModal: {
    width: '760px',
    maxWidth: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
  },
  modalDetalle: {
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '20px',
    width: '480px',
    maxWidth: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
  },
  btnCerrarModal: { border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--text-secondary)' },
  filaDetalle: { display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '14px', borderBottom: '1px solid var(--border)' },
};
