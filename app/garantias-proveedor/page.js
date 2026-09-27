'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '../../components/Shell';

const proveedorVacio = { nombre: '', identificacion: '', telefono: '' };
const formVacio = { proveedor_id: '', motivo: '', observaciones: '' };

const ETIQUETAS_RESOLUCION = {
  nota_credito: 'Nota crédito',
  producto_nuevo: 'Producto nuevo (reemplazo)',
  producto_reparado: 'Producto reparado',
  no_aplica_devuelto: 'No aplica — devuelto tal cual',
  no_aplica_baja: 'No aplica — dado de baja (pérdida)',
};

// A partir de este número de días sin respuesta del proveedor, un caso
// abierto se resalta en la lista para que sea fácil ver a quién hay que
// presionar.
const DIAS_ALERTA = 15;

function diasDesde(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

export default function GarantiasProveedorPage() {
  const [garantias, setGarantias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [proveedores, setProveedores] = useState([]);
  const [productosTodos, setProductosTodos] = useState([]);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(formVacio);
  const [items, setItems] = useState([]); // [{producto_id, referencia, nombre, cantidad, disponible}]
  const [buscarTexto, setBuscarTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const [mostrarNuevoProveedor, setMostrarNuevoProveedor] = useState(false);
  const [nuevoProveedor, setNuevoProveedor] = useState(proveedorVacio);
  const [guardandoProveedor, setGuardandoProveedor] = useState(false);

  const [detalle, setDetalle] = useState(null); // { id, garantia, items }
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [resolucionesPorItem, setResolucionesPorItem] = useState({});
  const [guardandoResolucion, setGuardandoResolucion] = useState(false);
  const [errorResolucion, setErrorResolucion] = useState('');

  async function cargarGarantias() {
    setCargando(true);
    try {
      const res = await fetch('/api/garantias-proveedor');
      const data = await res.json();
      if (data.ok) setGarantias(data.garantias);
      else setError(data.error || 'No se pudieron cargar las garantías');
    } catch {
      setError('No se pudieron cargar las garantías');
    } finally {
      setCargando(false);
    }
  }

  async function cargarProveedores() {
    const res = await fetch('/api/proveedores');
    const data = await res.json();
    if (data.ok) setProveedores(data.proveedores);
  }

  async function cargarProductos() {
    const res = await fetch('/api/productos');
    const data = await res.json();
    if (data.ok) setProductosTodos(data.productos);
  }

  useEffect(() => {
    cargarGarantias();
    cargarProveedores();
    cargarProductos();
  }, []);

  const resultadosBusqueda = useMemo(() => {
    const texto = buscarTexto.trim().toLowerCase();
    if (!texto) return [];
    return productosTodos
      .filter((p) => p.activo !== false && p.es_inventariable !== false)
      .filter((p) => (p.nombre || '').toLowerCase().includes(texto) || (p.referencia || '').toLowerCase().includes(texto))
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
          disponible: Number(producto.stock_principal) || 0,
        },
      ];
    });
    setBuscarTexto('');
  }

  function actualizarItem(productoId, campo, valor) {
    setItems((actual) => actual.map((it) => (it.producto_id === productoId ? { ...it, [campo]: valor } : it)));
  }

  function quitarItem(productoId) {
    setItems((actual) => actual.filter((it) => it.producto_id !== productoId));
  }

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

  async function guardarGarantia() {
    setErrorForm('');
    if (!form.proveedor_id) {
      setErrorForm('Selecciona el proveedor');
      return;
    }
    if (items.length === 0) {
      setErrorForm('Agrega al menos un producto');
      return;
    }
    const itemInvalido = items.find((it) => !it.cantidad || Number(it.cantidad) <= 0);
    if (itemInvalido) {
      setErrorForm(`Revisa la cantidad de "${itemInvalido.nombre}"`);
      return;
    }

    setGuardando(true);
    try {
      const res = await fetch('/api/garantias-proveedor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proveedor_id: Number(form.proveedor_id),
          motivo: form.motivo,
          observaciones: form.observaciones,
          items: items.map((it) => ({ producto_id: it.producto_id, cantidad: Number(it.cantidad) })),
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErrorForm(data.error || 'No se pudo guardar la garantía');
        return;
      }
      setMostrarForm(false);
      cargarGarantias();
      cargarProductos();
    } catch {
      setErrorForm('No se pudo guardar la garantía');
    } finally {
      setGuardando(false);
    }
  }

  async function abrirDetalle(id) {
    setCargandoDetalle(true);
    setDetalle({ id });
    setResolucionesPorItem({});
    setErrorResolucion('');
    try {
      const res = await fetch(`/api/garantias-proveedor/${id}`);
      const data = await res.json();
      if (data.ok) setDetalle(data);
      else setDetalle(null);
    } catch {
      setDetalle(null);
    } finally {
      setCargandoDetalle(false);
    }
  }

  function cerrarDetalle() {
    setDetalle(null);
    setResolucionesPorItem({});
    setErrorResolucion('');
  }

  function actualizarResolucionItem(itemId, campo, valor) {
    setResolucionesPorItem((actual) => ({
      ...actual,
      [itemId]: { ...(actual[itemId] || {}), [campo]: valor },
    }));
  }

  async function guardarResoluciones() {
    setErrorResolucion('');
    const seleccionadas = Object.entries(resolucionesPorItem)
      .filter(([, v]) => v && v.resolucion)
      .map(([itemId, v]) => ({
        id: Number(itemId),
        resolucion: v.resolucion,
        monto_nota_credito: v.resolucion === 'nota_credito' ? Number(v.monto_nota_credito) : undefined,
        nota_resolucion: v.nota_resolucion || undefined,
      }));

    if (seleccionadas.length === 0) {
      setErrorResolucion('Elige la resolución de al menos un producto');
      return;
    }
    const sinMonto = seleccionadas.find((s) => s.resolucion === 'nota_credito' && !(Number(s.monto_nota_credito) > 0));
    if (sinMonto) {
      setErrorResolucion('Ingresa el valor de la nota crédito');
      return;
    }

    setGuardandoResolucion(true);
    try {
      const res = await fetch(`/api/garantias-proveedor/${detalle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: seleccionadas }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErrorResolucion(data.error || 'No se pudo guardar la resolución');
        return;
      }
      await abrirDetalle(detalle.id);
      cargarGarantias();
    } catch {
      setErrorResolucion('No se pudo guardar la resolución');
    } finally {
      setGuardandoResolucion(false);
    }
  }

  function moneda(n) {
    return Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
  }
  function fecha(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-CO');
  }

  function estadoDe(g) {
    if (g.estado === 'resuelta') return { texto: 'Resuelta', estilo: styles.chipResuelta };
    if (Number(g.items_pendientes) < Number(g.items)) return { texto: 'Parcial', estilo: styles.chipParcial };
    return { texto: 'Enviada', estilo: styles.chipEnviada };
  }

  return (
    <Shell title="Garantías a proveedor">
      <div style={styles.header}>
        <h2 style={{ margin: 0 }}>Garantías a proveedor</h2>
        <button onClick={abrirForm} style={styles.btnPrimario}>+ Nueva garantía</button>
      </div>
      <p style={{ color: 'var(--text-secondary)', marginTop: '-8px' }}>
        Control de los productos que le entregas a un proveedor por garantía: a quién se lo diste, hace cuánto, y cómo
        se resolvió cada uno (nota crédito, producto nuevo, reparado, o no aplica).
      </p>

      {cargando ? (
        <p>Cargando...</p>
      ) : error ? (
        <p style={{ color: 'var(--danger)' }}>{error}</p>
      ) : (
        <div className="pos-tabla-scroll" style={styles.tableCard}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={styles.th}>Proveedor</th>
                <th style={styles.th}>Motivo</th>
                <th style={styles.th}>Enviado</th>
                <th style={styles.th}>Ítems</th>
                <th style={styles.th}>Estado</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {garantias.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ ...styles.td, color: 'var(--text-secondary)' }}>
                    Todavía no has registrado ninguna garantía a proveedor.
                  </td>
                </tr>
              )}
              {garantias.map((g) => {
                const dias = diasDesde(g.enviado_en);
                const abierta = g.estado !== 'resuelta';
                const estado = estadoDe(g);
                return (
                  <tr key={g.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={styles.td}>
                      <span onClick={() => abrirDetalle(g.id)} style={styles.clicable}>{g.proveedor_nombre}</span>
                    </td>
                    <td style={styles.td}>{g.motivo || '—'}</td>
                    <td style={styles.td}>
                      {fecha(g.enviado_en)}
                      <div style={{ fontSize: '12px', color: abierta && dias >= DIAS_ALERTA ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: abierta && dias >= DIAS_ALERTA ? 700 : 400 }}>
                        {abierta ? `Hace ${dias} día${dias === 1 ? '' : 's'}` : `Resuelta ${fecha(g.resuelto_en)}`}
                      </div>
                    </td>
                    <td style={styles.td}>
                      {g.items} producto{Number(g.items) === 1 ? '' : 's'} ({g.unidades} und.)
                      {Number(g.items_pendientes) > 0 && (
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{g.items_pendientes} pendiente{Number(g.items_pendientes) === 1 ? '' : 's'}</div>
                      )}
                    </td>
                    <td style={styles.td}>
                      <span style={estado.estilo}>{estado.texto}</span>
                    </td>
                    <td style={styles.td}>
                      <button onClick={() => abrirDetalle(g.id)} style={styles.btnSecundario}>
                        {abierta ? 'Resolver' : 'Ver'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {mostrarForm && (
        <div style={styles.overlay} onMouseDown={cerrarForm}>
          <div style={{ ...styles.formCard, ...styles.formModal }} onMouseDown={(e) => e.stopPropagation()}>
            <div style={styles.header}>
              <h3 style={{ margin: 0 }}>Nueva garantía a proveedor</h3>
              <button onClick={cerrarForm} style={styles.btnCerrarModal}>✕</button>
            </div>

            <div style={{ marginTop: '4px' }}>
              <label style={styles.etiquetaChica}>Proveedor *</label>
              {!mostrarNuevoProveedor ? (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
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
                  <div className="pos-grid2" style={styles.grid2}>
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

            <div style={{ marginTop: '12px' }}>
              <label style={styles.etiquetaChica}>Motivo (opcional)</label>
              <input
                value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                placeholder="Ej: llegó dañado de fábrica, no enciende..."
                style={{ ...styles.select, width: '100%' }}
              />
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
                      <span style={{ color: 'var(--text-secondary)', fontSize: '12px', marginLeft: '8px' }}>
                        {p.referencia} — disp: {Number(p.stock_principal) || 0}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {items.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', marginTop: '12px' }}>Todavía no has agregado productos.</p>
            ) : (
              <div className="pos-tabla-scroll">
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      <th style={styles.th}>Producto</th>
                      <th style={styles.th}>Disponible</th>
                      <th style={styles.th}>Cantidad</th>
                      <th style={styles.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.producto_id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={styles.td}>
                          <div style={{ fontWeight: 600 }}>{it.nombre}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{it.referencia}</div>
                        </td>
                        <td style={styles.td}>{it.disponible}</td>
                        <td style={styles.td}>
                          <input
                            type="number"
                            min="1"
                            max={it.disponible}
                            value={it.cantidad}
                            onChange={(e) => actualizarItem(it.producto_id, 'cantidad', e.target.value)}
                            style={{
                              ...styles.inputCantidad,
                              ...(Number(it.cantidad) > it.disponible ? { borderColor: 'var(--danger)' } : {}),
                            }}
                          />
                        </td>
                        <td style={styles.td}>
                          <button onClick={() => quitarItem(it.producto_id)} style={styles.btnQuitar}>Quitar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: '12px' }}>
              <label style={styles.etiquetaChica}>Observaciones (opcional)</label>
              <textarea
                value={form.observaciones}
                onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                rows={2}
                style={{ ...styles.select, width: '100%', resize: 'vertical' }}
              />
            </div>

            {errorForm && <p style={{ color: 'var(--danger)' }}>{errorForm}</p>}

            <div style={{ marginTop: '14px' }}>
              <button onClick={guardarGarantia} disabled={guardando} style={styles.btnPrimario}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
              <button onClick={cerrarForm} style={styles.btnSecundario}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {detalle && (
        <div style={styles.overlay} onMouseDown={cerrarDetalle}>
          <div style={styles.modalDetalle} onMouseDown={(e) => e.stopPropagation()}>
            <div style={styles.header}>
              <h3 style={{ margin: 0 }}>Garantía #{detalle.id}</h3>
              <button onClick={cerrarDetalle} style={styles.btnCerrarModal}>✕</button>
            </div>
            {cargandoDetalle ? (
              <p>Cargando...</p>
            ) : !detalle.garantia ? (
              <p style={{ color: 'var(--danger)' }}>No se pudo cargar el detalle.</p>
            ) : (
              <>
                <div style={styles.filaDetalle}><span>Proveedor</span><strong>{detalle.garantia.proveedor_nombre}</strong></div>
                {detalle.garantia.proveedor_telefono && (
                  <div style={styles.filaDetalle}><span>Teléfono</span><strong>{detalle.garantia.proveedor_telefono}</strong></div>
                )}
                <div style={styles.filaDetalle}><span>Enviado</span><strong>{fecha(detalle.garantia.enviado_en)} (hace {diasDesde(detalle.garantia.enviado_en)} días)</strong></div>
                {detalle.garantia.motivo && (
                  <div style={styles.filaDetalle}><span>Motivo</span><strong>{detalle.garantia.motivo}</strong></div>
                )}
                {detalle.garantia.observaciones && (
                  <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>{detalle.garantia.observaciones}</p>
                )}

                <div className="pos-tabla-scroll">
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                        <th style={styles.th}>Producto</th>
                        <th style={styles.th}>Cant.</th>
                        <th style={styles.th}>Resolución</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.items?.map((it) => {
                        const seleccion = resolucionesPorItem[it.id] || {};
                        return (
                          <tr key={it.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={styles.td}>
                              {it.nombre}
                              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{it.referencia}</div>
                            </td>
                            <td style={styles.td}>{it.cantidad}</td>
                            <td style={styles.td}>
                              {it.resolucion ? (
                                <div>
                                  <span style={styles.chipResuelta}>{ETIQUETAS_RESOLUCION[it.resolucion] || it.resolucion}</span>
                                  {it.resolucion === 'nota_credito' && (
                                    <div style={{ fontSize: '12px', marginTop: '4px' }}>Valor: ${moneda(it.monto_nota_credito)}</div>
                                  )}
                                  {it.nota_resolucion && (
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{it.nota_resolucion}</div>
                                  )}
                                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{fecha(it.resuelto_en)}</div>
                                </div>
                              ) : (
                                <div>
                                  <select
                                    value={seleccion.resolucion || ''}
                                    onChange={(e) => actualizarResolucionItem(it.id, 'resolucion', e.target.value)}
                                    style={{ ...styles.select, width: '100%' }}
                                  >
                                    <option value="">Sin resolver todavía</option>
                                    {Object.entries(ETIQUETAS_RESOLUCION).map(([valor, etiqueta]) => (
                                      <option key={valor} value={valor}>{etiqueta}</option>
                                    ))}
                                  </select>
                                  {seleccion.resolucion === 'nota_credito' && (
                                    <input
                                      type="number"
                                      min="0"
                                      placeholder="Valor de la nota crédito"
                                      value={seleccion.monto_nota_credito || ''}
                                      onChange={(e) => actualizarResolucionItem(it.id, 'monto_nota_credito', e.target.value)}
                                      style={{ ...styles.select, width: '100%', marginTop: '6px' }}
                                    />
                                  )}
                                  {seleccion.resolucion && (
                                    <input
                                      placeholder="Nota (opcional)"
                                      value={seleccion.nota_resolucion || ''}
                                      onChange={(e) => actualizarResolucionItem(it.id, 'nota_resolucion', e.target.value)}
                                      style={{ ...styles.select, width: '100%', marginTop: '6px' }}
                                    />
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {detalle.items?.some((it) => !it.resolucion) && (
                  <>
                    {errorResolucion && <p style={{ color: 'var(--danger)', marginTop: '10px' }}>{errorResolucion}</p>}
                    <div style={{ marginTop: '12px' }}>
                      <button onClick={guardarResoluciones} disabled={guardandoResolucion} style={styles.btnPrimario}>
                        {guardandoResolucion ? 'Guardando...' : 'Guardar resolución'}
                      </button>
                    </div>
                  </>
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
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' },
  tableCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 16px' },
  th: { padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)' },
  td: { padding: '10px 8px', fontSize: '14px', verticalAlign: 'top' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  btnSecundario: { padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', marginLeft: '8px', cursor: 'pointer' },
  btnQuitar: { padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '12px', color: 'var(--danger)' },
  btnMiniLink: { border: 'none', background: 'none', color: 'var(--teal-dark)', cursor: 'pointer', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap' },
  clicable: { cursor: 'pointer', color: 'var(--teal-dark)', fontWeight: 600 },
  chipEnviada: { padding: '3px 10px', borderRadius: '999px', background: '#fef3c7', color: '#92400e', fontSize: '12px', fontWeight: 600 },
  chipParcial: { padding: '3px 10px', borderRadius: '999px', background: '#dbeafe', color: '#1e40af', fontSize: '12px', fontWeight: 600 },
  chipResuelta: { padding: '3px 10px', borderRadius: '999px', background: 'var(--teal-light)', color: 'var(--teal-dark)', fontSize: '12px', fontWeight: 600 },
  etiquetaChica: { display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' },
  select: { padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', boxSizing: 'border-box' },
  grid2: { gap: '12px' },
  inputCantidad: { width: '80px', padding: '7px', borderRadius: '6px', border: '1px solid var(--border)', boxSizing: 'border-box' },
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
    width: '560px',
    maxWidth: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
  },
  btnCerrarModal: { border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--text-secondary)' },
  filaDetalle: { display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: '8px' },
};
