'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

let contadorKey = 0;
function nuevaLinea() {
  contadorKey += 1;
  return {
    _key: contadorKey,
    producto_id: '',
    nombreNuevo: '',
    referenciaNuevo: '',
    precio_unitario: '',
    descuento_porcentaje: '',
    cantidad: 1,
    observaciones: '',
  };
}

export default function EntradasPage() {
  const [productos, setProductos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [comprasRecientes, setComprasRecientes] = useState([]);
  const [carrito, setCarrito] = useState([nuevaLinea()]);

  const [numeroFactura, setNumeroFactura] = useState('');
  const [fechaCompra, setFechaCompra] = useState(hoyISO());
  const [fechaVencimiento, setFechaVencimiento] = useState(hoyISO());
  const [notas, setNotas] = useState('');

  const [proveedorId, setProveedorId] = useState('');
  const [nuevoProveedor, setNuevoProveedor] = useState(false);
  const [nombreProveedor, setNombreProveedor] = useState('');
  const [identificacionProveedor, setIdentificacionProveedor] = useState('');
  const [telefonoProveedor, setTelefonoProveedor] = useState('');

  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function cargarTodo() {
    const [rProd, rProv, rCompras] = await Promise.all([
      fetch('/api/productos'),
      fetch('/api/proveedores'),
      fetch('/api/compras'),
    ]);
    const dProd = await rProd.json();
    const dProv = await rProv.json();
    const dCompras = await rCompras.json();
    if (dProd.ok) setProductos(dProd.productos.filter((p) => p.activo));
    if (dProv.ok) setProveedores(dProv.proveedores);
    if (dCompras.ok) setComprasRecientes(dCompras.compras);
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  function actualizarLinea(key, campo, valor) {
    setCarrito((prev) => prev.map((l) => (l._key === key ? { ...l, [campo]: valor } : l)));
  }

  function seleccionarProducto(key, valor) {
    if (valor === '__nuevo__') {
      actualizarLinea(key, 'producto_id', '__nuevo__');
      return;
    }
    const producto = productos.find((p) => String(p.id) === String(valor));
    setCarrito((prev) =>
      prev.map((l) =>
        l._key === key
          ? { ...l, producto_id: valor, precio_unitario: producto?.precio_costo || l.precio_unitario || '' }
          : l
      )
    );
  }

  async function crearProductoEnLinea(key) {
    setError('');
    const linea = carrito.find((l) => l._key === key);
    if (!linea.nombreNuevo.trim() || !linea.referenciaNuevo.trim()) {
      setError('Completa nombre y referencia del nuevo producto');
      return;
    }

    const res = await fetch('/api/productos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referencia: linea.referenciaNuevo.trim(),
        nombre: linea.nombreNuevo.trim(),
        activo: true,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error || 'No se pudo crear el producto');
      return;
    }

    const rProd = await fetch('/api/productos');
    const dProd = await rProd.json();
    let nuevoId = data.producto?.id ?? data.id ?? null;
    if (dProd.ok) {
      setProductos(dProd.productos.filter((p) => p.activo));
      if (!nuevoId) {
        const encontrado = dProd.productos.find((p) => p.referencia === linea.referenciaNuevo.trim());
        nuevoId = encontrado?.id ?? null;
      }
    }

    if (!nuevoId) {
      setError('El producto se creó pero no se pudo seleccionar automáticamente. Búscalo en la lista.');
      return;
    }

    setCarrito((prev) =>
      prev.map((l) => (l._key === key ? { ...l, producto_id: String(nuevoId), nombreNuevo: '', referenciaNuevo: '' } : l))
    );
  }

  function agregarLinea() {
    setCarrito((prev) => [...prev, nuevaLinea()]);
  }

  function quitarLinea(key) {
    setCarrito((prev) => (prev.length === 1 ? prev : prev.filter((l) => l._key !== key)));
  }

  function lineaTotal(l) {
    const descuento = Number(l.descuento_porcentaje) || 0;
    const precio = Number(l.precio_unitario) || 0;
    const cantidad = Number(l.cantidad) || 0;
    return precio * cantidad * (1 - descuento / 100);
  }

  function lineaSubtotal(l) {
    return (Number(l.precio_unitario) || 0) * (Number(l.cantidad) || 0);
  }

  const lineasValidas = carrito.filter((l) => l.producto_id && l.producto_id !== '__nuevo__');
  const subtotal = lineasValidas.reduce((acc, l) => acc + lineaSubtotal(l), 0);
  const total = lineasValidas.reduce((acc, l) => acc + lineaTotal(l), 0);
  const descuentoTotal = subtotal - total;

  async function confirmarCompra() {
    setError('');
    setMensaje('');

    if (lineasValidas.length === 0) {
      setError('Agrega al menos un producto');
      return;
    }
    if (!proveedorId && !nombreProveedor.trim()) {
      setError('Selecciona un proveedor o crea uno nuevo');
      return;
    }

    setGuardando(true);
    const res = await fetch('/api/compras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proveedor_id: proveedorId ? Number(proveedorId) : null,
        proveedor_nuevo: !proveedorId
          ? { nombre: nombreProveedor, identificacion: identificacionProveedor, telefono: telefonoProveedor }
          : null,
        numero_factura: numeroFactura,
        fecha_compra: fechaCompra,
        fecha_vencimiento: fechaVencimiento,
        notas,
        items: lineasValidas.map((l) => ({
          producto_id: Number(l.producto_id),
          cantidad: Number(l.cantidad) || 0,
          precio_unitario: Number(l.precio_unitario) || 0,
          descuento_porcentaje: Number(l.descuento_porcentaje) || 0,
          observaciones: l.observaciones,
        })),
      }),
    });
    const data = await res.json();
    setGuardando(false);

    if (data.ok) {
      setMensaje('Compra registrada.');
      setCarrito([nuevaLinea()]);
      setProveedorId('');
      setNuevoProveedor(false);
      setNombreProveedor('');
      setIdentificacionProveedor('');
      setTelefonoProveedor('');
      setNumeroFactura('');
      setNotas('');
      setFechaCompra(hoyISO());
      setFechaVencimiento(hoyISO());
      cargarTodo();
    } else {
      setError(data.error || 'No se pudo registrar la compra');
    }
  }

  function moneda(n) {
    return `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
  }

  return (
    <Shell title="Entradas">
      <div style={styles.card}>
        <h2 style={{ marginTop: 0 }}>Nueva compra</h2>

        <div style={styles.filaTop}>
          <label style={styles.labelCampo}>
            Factura de compra N°
            <input value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} style={styles.inputCampo} />
          </label>
          <label style={styles.labelCampo}>
            Fecha de compra
            <input type="date" value={fechaCompra} onChange={(e) => setFechaCompra(e.target.value)} style={styles.inputCampo} />
          </label>
        </div>

        <h3 style={styles.subtitulo}>Información general</h3>
        <div style={styles.grid3}>
          <div>
            <label style={styles.labelCampo}>
              Proveedor *
              {!nuevoProveedor ? (
                <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} style={styles.inputCampo}>
                  <option value="">Seleccionar</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={nombreProveedor}
                  onChange={(e) => setNombreProveedor(e.target.value)}
                  placeholder="Nombre del proveedor"
                  style={styles.inputCampo}
                />
              )}
            </label>
            <button
              type="button"
              onClick={() => {
                setNuevoProveedor(!nuevoProveedor);
                setProveedorId('');
                setNombreProveedor('');
              }}
              style={styles.linkBtn}
            >
              {nuevoProveedor ? 'Cancelar, elegir existente' : '+ Nuevo proveedor'}
            </button>
          </div>
          <label style={styles.labelCampo}>
            Identificación
            <input
              value={identificacionProveedor}
              onChange={(e) => setIdentificacionProveedor(e.target.value)}
              style={styles.inputCampo}
              disabled={!nuevoProveedor && !!proveedorId}
            />
          </label>
          <label style={styles.labelCampo}>
            Teléfono
            <input
              value={telefonoProveedor}
              onChange={(e) => setTelefonoProveedor(e.target.value)}
              style={styles.inputCampo}
              disabled={!nuevoProveedor && !!proveedorId}
            />
          </label>
        </div>

        <div style={styles.grid3}>
          <label style={styles.labelCampo}>
            Moneda
            <input value="COP" disabled style={styles.inputCampo} />
          </label>
          <label style={styles.labelCampo}>
            Fecha de vencimiento *
            <input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} style={styles.inputCampo} />
          </label>
          <label style={styles.labelCampo}>
            Bodega
            <select disabled style={styles.inputCampo}>
              <option>Kennedy</option>
            </select>
          </label>
        </div>

        <h3 style={styles.subtitulo}>Productos comprados</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.tabla}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                <th style={styles.th}>Producto</th>
                <th style={styles.th}>Precio</th>
                <th style={styles.th}>Descuento %</th>
                <th style={styles.th}>Cantidad</th>
                <th style={styles.th}>Observaciones</th>
                <th style={styles.th}>Total</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {carrito.map((l) => (
                <tr key={l._key} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ ...styles.td, minWidth: '220px' }}>
                    {l.producto_id === '__nuevo__' ? (
                      <div style={styles.nuevoProductoBox}>
                        <input
                          value={l.nombreNuevo}
                          onChange={(e) => actualizarLinea(l._key, 'nombreNuevo', e.target.value)}
                          placeholder="Nombre del producto"
                          style={styles.inputCampo}
                        />
                        <input
                          value={l.referenciaNuevo}
                          onChange={(e) => actualizarLinea(l._key, 'referenciaNuevo', e.target.value)}
                          placeholder="Referencia"
                          style={styles.inputCampo}
                        />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button type="button" onClick={() => crearProductoEnLinea(l._key)} style={styles.btnCrearChico}>Crear</button>
                          <button type="button" onClick={() => actualizarLinea(l._key, 'producto_id', '')} style={styles.linkBtn}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <select
                        value={l.producto_id}
                        onChange={(e) => seleccionarProducto(l._key, e.target.value)}
                        style={styles.inputCampo}
                      >
                        <option value="">Seleccionar</option>
                        {productos.map((p) => (
                          <option key={p.id} value={p.id}>{p.referencia} - {p.nombre}</option>
                        ))}
                        <option value="__nuevo__">+ Crear nuevo producto</option>
                      </select>
                    )}
                  </td>
                  <td style={styles.td}>
                    <input
                      type="number"
                      step="0.01"
                      value={l.precio_unitario}
                      onChange={(e) => actualizarLinea(l._key, 'precio_unitario', e.target.value)}
                      placeholder="0"
                      style={styles.inputCelda}
                    />
                  </td>
                  <td style={styles.td}>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={l.descuento_porcentaje}
                      onChange={(e) => actualizarLinea(l._key, 'descuento_porcentaje', e.target.value)}
                      placeholder="0"
                      style={styles.inputCelda}
                    />
                  </td>
                  <td style={styles.td}>
                    <input
                      type="number"
                      min="1"
                      value={l.cantidad}
                      onChange={(e) => actualizarLinea(l._key, 'cantidad', e.target.value)}
                      style={styles.inputCelda}
                    />
                  </td>
                  <td style={styles.td}>
                    <input
                      value={l.observaciones}
                      onChange={(e) => actualizarLinea(l._key, 'observaciones', e.target.value)}
                      placeholder="Observaciones"
                      style={styles.inputCelda}
                    />
                  </td>
                  <td style={{ ...styles.td, fontWeight: 600, whiteSpace: 'nowrap' }}>{moneda(lineaTotal(l))}</td>
                  <td style={styles.td}>
                    <button type="button" onClick={() => quitarLinea(l._key)} style={styles.btnQuitar}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={agregarLinea} style={styles.btnAgregarProducto}>+ Agregar producto</button>

        <div style={styles.filaInferior}>
          <label style={{ ...styles.labelCampo, flex: 1 }}>
            Notas
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} style={{ ...styles.inputCampo, minHeight: '80px' }} />
          </label>
          <div style={styles.resumen}>
            <div style={styles.filaResumen}><span>Subtotal</span><span>{moneda(subtotal)}</span></div>
            <div style={styles.filaResumen}><span>Descuento</span><span>-{moneda(descuentoTotal)}</span></div>
            <div style={{ ...styles.filaResumen, borderTop: '1px solid var(--border)', paddingTop: '8px', fontWeight: 700 }}>
              <span>Total</span><span>{moneda(total)}</span>
            </div>
          </div>
        </div>

        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        {mensaje && <p style={{ color: 'var(--teal-dark)' }}>{mensaje}</p>}

        <div style={styles.filaBotones}>
          <button type="button" onClick={() => setCarrito([nuevaLinea()])} style={styles.btnSecundario}>Cancelar</button>
          <button type="button" onClick={confirmarCompra} disabled={guardando} style={styles.btnPrimario}>
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      <h3>Compras recientes</h3>
      <div style={styles.tableCard}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={styles.th}>Factura</th>
              <th style={styles.th}>Proveedor</th>
              <th style={styles.th}>Fecha</th>
              <th style={styles.th}>Ítems</th>
              <th style={styles.th}>Total</th>
            </tr>
          </thead>
          <tbody>
            {comprasRecientes.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={styles.td}>{c.numero_factura || `#${c.id}`}</td>
                <td style={styles.td}>{c.proveedor_nombre || 'Sin proveedor'}</td>
                <td style={styles.td}>{c.fecha_compra ? new Date(c.fecha_compra).toLocaleDateString('es-CO') : '-'}</td>
                <td style={styles.td}>{c.items}</td>
                <td style={styles.td}>{moneda(c.total)}</td>
              </tr>
            ))}
            {comprasRecientes.length === 0 && (
              <tr>
                <td style={styles.td} colSpan={5}>Sin compras registradas.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

const styles = {
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '24px', marginBottom: '28px' },
  subtitulo: { marginBottom: '10px' },
  filaTop: { display: 'flex', gap: '16px', maxWidth: '500px', marginBottom: '8px' },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '4px' },
  labelCampo: { display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' },
  inputCampo: {
    display: 'block',
    width: '100%',
    padding: '9px',
    marginTop: '4px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    boxSizing: 'border-box',
    fontSize: '14px',
  },
  linkBtn: { border: 'none', background: 'none', color: 'var(--teal-dark)', cursor: 'pointer', fontSize: '13px', padding: 0, marginBottom: '12px' },
  tabla: { width: '100%', borderCollapse: 'collapse', marginTop: '8px' },
  th: { padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'left' },
  td: { padding: '8px', fontSize: '14px', verticalAlign: 'top' },
  inputCelda: { width: '90px', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', boxSizing: 'border-box' },
  nuevoProductoBox: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '200px' },
  btnCrearChico: { padding: '6px 12px', borderRadius: '6px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontSize: '13px' },
  btnQuitar: { border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '16px' },
  btnAgregarProducto: {
    marginTop: '12px',
    padding: '10px 18px',
    borderRadius: 'var(--radius)',
    border: 'none',
    background: 'var(--teal)',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  },
  filaInferior: { display: 'flex', gap: '24px', marginTop: '24px', alignItems: 'flex-start' },
  resumen: { width: '280px', flexShrink: 0, background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '16px' },
  filaResumen: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '14px' },
  filaBotones: { display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' },
  btnSecundario: { padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' },
  btnPrimario: { padding: '10px 20px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  tableCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 16px' },
};
