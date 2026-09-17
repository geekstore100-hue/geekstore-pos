'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '../../components/Shell';

export default function VentasPage() {
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [carrito, setCarrito] = useState([]);
  const [editandoId, setEditandoId] = useState(null);
  const [medioPago, setMedioPago] = useState('');
  const [vendedor, setVendedor] = useState('');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function cargarTodo() {
    const res = await fetch('/api/productos');
    const data = await res.json();
    if (data.ok) setProductos(data.productos.filter((p) => p.activo));
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
          precio_unitario: Number(producto.precio_venta) || 0,
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

  async function confirmarVenta() {
    setError('');
    setMensaje('');

    if (carrito.length === 0) {
      setError('Agrega al menos un producto');
      return;
    }
    if (!medioPago) {
      setError('Selecciona el medio de pago');
      return;
    }

    setGuardando(true);
    const res = await fetch('/api/ventas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        medio_pago: medioPago,
        vendedor,
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
      setMensaje('Venta registrada.');
      setCarrito([]);
      setEditandoId(null);
      setMedioPago('');
      cargarTodo();
    } else {
      setError(data.error || 'No se pudo registrar la venta');
    }
  }

  function moneda(n) {
    return `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
  }

  return (
    <Shell title="Vender">
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
              const agotado = Number(p.stock) <= 0;
              return (
                <div
                  key={p.id}
                  onClick={() => !agotado && agregarAlCarrito(p)}
                  style={{
                    ...styles.tarjeta,
                    ...(enCarrito ? styles.tarjetaActiva : {}),
                    ...(agotado ? styles.tarjetaAgotada : {}),
                  }}
                >
                  <div style={styles.tarjetaTop}>
                    <span style={styles.referencia}>{p.referencia}</span>
                    {enCarrito && <span style={styles.badgeCantidad}>{enCarrito.cantidad}</span>}
                  </div>
                  <div style={styles.icono}>📦</div>
                  <div style={styles.nombre}>{p.nombre}</div>
                  {agotado ? <div style={styles.agotado}>Agotado</div> : <div style={styles.precio}>{moneda(p.precio_venta)}</div>}
                </div>
              );
            })}
            {filtrados.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Sin productos.</p>}
          </div>
        </div>

        <div style={styles.columnaCarrito}>
          <h3 style={{ marginTop: 0 }}>Factura de venta</h3>

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

          <div style={styles.piePanel}>
            <div style={styles.filaDosCampos}>
              <label style={styles.labelCampo}>
                Medio de pago *
                <select value={medioPago} onChange={(e) => setMedioPago(e.target.value)} style={styles.inputCampo}>
                  <option value="">Seleccionar</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Tarjeta">Tarjeta</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Otro">Otro</option>
                </select>
              </label>
              <label style={styles.labelCampo}>
                Vendedor
                <input value={vendedor} onChange={(e) => setVendedor(e.target.value)} style={styles.inputCampo} />
              </label>
            </div>

            {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
            {mensaje && <p style={{ color: 'var(--teal-dark)' }}>{mensaje}</p>}

            <button onClick={confirmarVenta} disabled={guardando || carrito.length === 0} style={styles.btnVender}>
              <span>{guardando ? 'Registrando...' : 'Vender'}</span>
              <span>{moneda(total)}</span>
            </button>

            <div style={styles.piePagina}>
              <span>{carrito.length} producto(s)</span>
              <button onClick={() => setCarrito([])} style={styles.btnCancelar}>Cancelar</button>
            </div>
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
  tarjetaAgotada: { opacity: 0.5, cursor: 'not-allowed' },
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
  agotado: { fontSize: '12px', color: 'var(--warning)' },
  columnaCarrito: {
    width: '340px',
    flexShrink: 0,
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    height: 'calc(100vh - 104px)',
    position: 'sticky',
    top: '24px',
  },
  listaCarrito: { flex: 1, overflowY: 'auto', marginBottom: '12px' },
  itemCarrito: { borderBottom: '1px solid var(--border)', padding: '10px 0' },
  itemHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px' },
  btnQuitar: { border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '16px' },
  itemControles: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' },
  stepper: { display: 'flex', alignItems: 'center', gap: '10px' },
  stepperBtn: { width: '24px', height: '24px', borderRadius: '6px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' },
  edicion: { display: 'flex', gap: '10px', marginTop: '8px' },
  labelEdicion: { fontSize: '12px', color: 'var(--text-secondary)', flex: 1 },
  inputEdicion: { display: 'block', width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid var(--border)', marginTop: '2px' },
  piePanel: { flexShrink: 0, borderTop: '1px solid var(--border)', paddingTop: '12px' },
  filaDosCampos: { display: 'flex', gap: '10px' },
  labelCampo: { display: 'block', fontSize: '12px', color: 'var(--text-secondary)', flex: 1, marginBottom: '8px' },
  inputCampo: {
    display: 'block',
    width: '100%',
    padding: '8px',
    marginTop: '4px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    boxSizing: 'border-box',
    fontSize: '13px',
  },
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
    marginTop: '4px',
  },
  piePagina: { display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '13px', color: 'var(--text-secondary)' },
  btnCancelar: { border: 'none', background: 'none', color: 'var(--teal-dark)', cursor: 'pointer' },
};
