'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '../../components/Shell';

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function EntradasPage() {
  const [productos, setProductos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [comprasRecientes, setComprasRecientes] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [carrito, setCarrito] = useState([]);
  const [editandoId, setEditandoId] = useState(null);

  const [proveedorId, setProveedorId] = useState('');
  const [nuevoProveedor, setNuevoProveedor] = useState(false);
  const [nombreProveedor, setNombreProveedor] = useState('');
  const [identificacionProveedor, setIdentificacionProveedor] = useState('');
  const [telefonoProveedor, setTelefonoProveedor] = useState('');

  const [numeroFactura, setNumeroFactura] = useState('');
  const [fechaCompra, setFechaCompra] = useState(hoyISO());
  const [notas, setNotas] = useState('');

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
    if (dProd.ok) setProductos(dProd.productos);
    if (dProv.ok) setProveedores(dProv.proveedores);
    if (dCompras.ok) setComprasRecientes(dCompras.compras);
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter((p) => p.referencia.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q));
  }, [busqueda, productos]);

  function agregarAlCarrito(producto) {
    setCarrito((prev) => {
      const existente = prev.find((i) => i.producto_id === producto.id);
      if (existente) {
        return prev.map((i) => (i.producto_id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i));
      }
      return [
        ...prev,
        {
          producto_id: producto.id,
          referencia: producto.referencia,
          nombre: producto.nombre,
          cantidad: 1,
          precio_unitario: Number(producto.precio_costo) || 0,
          descuento_porcentaje: 0,
        },
      ];
    });
  }

  function cambiarCantidad(producto_id, delta) {
    setCarrito((prev) =>
      prev.map((i) => (i.producto_id === producto_id ? { ...i, cantidad: i.cantidad + delta } : i)).filter((i) => i.cantidad > 0)
    );
  }

  function quitarDelCarrito(producto_id) {
    setCarrito((prev) => prev.filter((i) => i.producto_id !== producto_id));
    setEditandoId(null);
  }

  function actualizarItem(producto_id, campo, valor) {
    setCarrito((prev) => prev.map((i) => (i.producto_id === producto_id ? { ...i, [campo]: valor } : i)));
  }

  function subtotalItem(item) {
    const descuento = Number(item.descuento_porcentaje) || 0;
    return item.cantidad * Number(item.precio_unitario) * (1 - descuento / 100);
  }

  const total = carrito.reduce((acc, i) => acc + subtotalItem(i), 0);

  async function confirmarCompra() {
    setError('');
    setMensaje('');

    if (carrito.length === 0) {
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
        notas,
        items: carrito.map((i) => ({
          producto_id: i.producto_id,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
          descuento_porcentaje: i.descuento_porcentaje || 0,
        })),
      }),
    });
    const data = await res.json();
    setGuardando(false);

    if (data.ok) {
      setMensaje('Compra registrada.');
      setCarrito([]);
      setEditandoId(null);
      setProveedorId('');
      setNuevoProveedor(false);
      setNombreProveedor('');
      setIdentificacionProveedor('');
      setTelefonoProveedor('');
      setNumeroFactura('');
      setNotas('');
      setFechaCompra(hoyISO());
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
      <div style={styles.layout}>
        <div style={styles.columnaProductos}>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar productos por referencia o nombre..."
            style={styles.buscador}
          />
          <div style={styles.grid}>
            {filtrados.map((p) => {
              const enCarrito = carrito.find((i) => i.producto_id === p.id);
              return (
                <div
                  key={p.id}
                  onClick={() => agregarAlCarrito(p)}
                  style={{
                    ...styles.tarjeta,
                    ...(enCarrito ? styles.tarjetaActiva : {}),
                  }}
                >
                  <div style={styles.tarjetaTop}>
                    <span style={styles.referencia}>{p.referencia}</span>
                    {enCarrito && <span style={styles.badgeCantidad}>{enCarrito.cantidad}</span>}
                  </div>
                  <div style={styles.icono}>📦</div>
                  <div style={styles.nombre}>{p.nombre}</div>
                  <div style={styles.precio}>Stock: {p.stock}</div>
                </div>
              );
            })}
            {filtrados.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Sin productos.</p>}
          </div>
        </div>

        <div style={styles.columnaCarrito}>
          <h3 style={{ marginTop: 0 }}>Factura de compra</h3>

          <label style={styles.labelCampo}>
            Proveedor
            {!nuevoProveedor ? (
              <select
                value={proveedorId}
                onChange={(e) => {
                  if (e.target.value === '__nuevo__') {
                    setNuevoProveedor(true);
                    setProveedorId('');
                  } else {
                    setProveedorId(e.target.value);
                  }
                }}
                style={styles.inputCampo}
              >
                <option value="">Selecciona un proveedor...</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
                <option value="__nuevo__">+ Nuevo proveedor</option>
              </select>
            ) : (
              <div style={styles.nuevoProveedorBox}>
                <input
                  value={nombreProveedor}
                  onChange={(e) => setNombreProveedor(e.target.value)}
                  placeholder="Nombre del proveedor"
                  style={styles.inputCampo}
                />
                <input
                  value={identificacionProveedor}
                  onChange={(e) => setIdentificacionProveedor(e.target.value)}
                  placeholder="NIT / identificación (opcional)"
                  style={styles.inputCampo}
                />
                <input
                  value={telefonoProveedor}
                  onChange={(e) => setTelefonoProveedor(e.target.value)}
                  placeholder="Teléfono (opcional)"
                  style={styles.inputCampo}
                />
                <button
                  type="button"
                  onClick={() => {
                    setNuevoProveedor(false);
                    setNombreProveedor('');
                    setIdentificacionProveedor('');
                    setTelefonoProveedor('');
                  }}
                  style={styles.btnCancelarChico}
                >
                  Cancelar, elegir existente
                </button>
              </div>
            )}
          </label>

          <div style={styles.filaDosCampos}>
            <label style={styles.labelCampo}>
              N.º de factura
              <input value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} style={styles.inputCampo} />
            </label>
            <label style={styles.labelCampo}>
              Fecha de compra
              <input type="date" value={fechaCompra} onChange={(e) => setFechaCompra(e.target.value)} style={styles.inputCampo} />
            </label>
          </div>

          <div style={styles.listaCarrito}>
            {carrito.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Toca un producto para agregarlo.</p>}
            {carrito.map((item) => (
              <div key={item.producto_id} style={styles.itemCarrito}>
                <div style={styles.itemHeader}>
                  <strong
                    onClick={() => setEditandoId(editandoId === item.producto_id ? null : item.producto_id)}
                    style={{ cursor: 'pointer' }}
                  >
                    {item.nombre}
                  </strong>
                  <button onClick={() => quitarDelCarrito(item.producto_id)} style={styles.btnQuitar}>×</button>
                </div>

                <div style={styles.itemControles}>
                  <div style={styles.stepper}>
                    <button onClick={() => cambiarCantidad(item.producto_id, -1)} style={styles.stepperBtn}>−</button>
                    <span>{item.cantidad}</span>
                    <button onClick={() => cambiarCantidad(item.producto_id, 1)} style={styles.stepperBtn}>+</button>
                  </div>
                  <span style={{ fontWeight: 600 }}>{moneda(subtotalItem(item))}</span>
                </div>

                {editandoId === item.producto_id && (
                  <div style={styles.edicion}>
                    <label style={styles.labelEdicion}>
                      Precio
                      <input
                        type="number"
                        step="0.01"
                        value={item.precio_unitario}
                        onChange={(e) => actualizarItem(item.producto_id, 'precio_unitario', e.target.value)}
                        style={styles.inputEdicion}
                      />
                    </label>
                    <label style={styles.labelEdicion}>
                      Descuento %
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="100"
                        value={item.descuento_porcentaje}
                        onChange={(e) => actualizarItem(item.producto_id, 'descuento_porcentaje', e.target.value)}
                        style={styles.inputEdicion}
                      />
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>

          <label style={styles.labelCampo}>
            Notas (opcional)
            <input value={notas} onChange={(e) => setNotas(e.target.value)} style={styles.inputCampo} />
          </label>

          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
          {mensaje && <p style={{ color: 'var(--teal-dark)' }}>{mensaje}</p>}

          <button onClick={confirmarCompra} disabled={guardando || carrito.length === 0} style={styles.btnVender}>
            <span>{guardando ? 'Registrando...' : 'Registrar compra'}</span>
            <span>{moneda(total)}</span>
          </button>

          <div style={styles.piePagina}>
            <span>{carrito.length} producto(s)</span>
            <button onClick={() => setCarrito([])} style={styles.btnCancelar}>Cancelar</button>
          </div>

          <h4 style={{ marginTop: '24px' }}>Compras recientes</h4>
          <div>
            {comprasRecientes.map((c) => (
              <div key={c.id} style={styles.filaVentaHoy}>
                <span>{c.numero_factura || `#${c.id}`}</span>
                <span>{c.proveedor_nombre || 'Sin proveedor'}</span>
                <span>{moneda(c.total)}</span>
              </div>
            ))}
            {comprasRecientes.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Sin compras registradas.</p>}
          </div>
        </div>
      </div>
    </Shell>
  );
}

const styles = {
  layout: { display: 'flex', gap: '20px', alignItems: 'flex-start' },
  columnaProductos: { flex: 1, minWidth: 0 },
  buscador: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    marginBottom: '16px',
    boxSizing: 'border-box',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '12px',
  },
  tarjeta: {
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '12px',
    cursor: 'pointer',
    textAlign: 'center',
    position: 'relative',
  },
  tarjetaActiva: { border: '2px solid var(--teal)' },
  tarjetaTop: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' },
  referencia: {},
  badgeCantidad: {
    background: 'var(--teal)',
    color: '#fff',
    borderRadius: '999px',
    width: '18px',
    height: '18px',
    fontSize: '11px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icono: { fontSize: '28px', margin: '8px 0' },
  nombre: { fontSize: '13px', fontWeight: 600, marginBottom: '4px', minHeight: '32px' },
  precio: { fontSize: '13px', color: 'var(--text-secondary)' },
  columnaCarrito: {
    width: '360px',
    flexShrink: 0,
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '16px',
  },
  labelCampo: { display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' },
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
  filaDosCampos: { display: 'flex', gap: '10px' },
  nuevoProveedorBox: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' },
  btnCancelarChico: { border: 'none', background: 'none', color: 'var(--teal-dark)', cursor: 'pointer', fontSize: '12px', padding: 0, textAlign: 'left' },
  listaCarrito: { maxHeight: '260px', overflowY: 'auto', marginBottom: '12px', borderTop: '1px solid var(--border)' },
  itemCarrito: { borderBottom: '1px solid var(--border)', padding: '10px 0' },
  itemHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px' },
  btnQuitar: { border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '16px' },
  itemControles: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' },
  stepper: { display: 'flex', alignItems: 'center', gap: '10px' },
  stepperBtn: { width: '24px', height: '24px', borderRadius: '6px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' },
  edicion: { display: 'flex', gap: '10px', marginTop: '8px' },
  labelEdicion: { fontSize: '12px', color: 'var(--text-secondary)', flex: 1 },
  inputEdicion: { display: 'block', width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid var(--border)', marginTop: '2px' },
  btnVender: {
    width: '100%',
    padding: '14px',
    borderRadius: 'var(--radius)',
    border: 'none',
    background: 'var(--teal)',
    color: '#fff',
    fontWeight: 700,
    fontSize: '15px',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '8px',
  },
  piePagina: { display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '13px', color: 'var(--text-secondary)' },
  btnCancelar: { border: 'none', background: 'none', color: 'var(--teal-dark)', cursor: 'pointer' },
  filaVentaHoy: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '6px 0', borderBottom: '1px solid var(--border)', gap: '6px' },
};
