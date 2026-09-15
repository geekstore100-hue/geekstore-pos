'use client';

import { useEffect, useMemo, useState } from 'react';

export default function VentasPage() {
  const [productos, setProductos] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [productoId, setProductoId] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function cargarTodo() {
    const [rProd, rVentas] = await Promise.all([
      fetch('/api/productos'),
      fetch('/api/ventas'),
    ]);
    const dProd = await rProd.json();
    const dVentas = await rVentas.json();
    if (dProd.ok) setProductos(dProd.productos.filter((p) => p.activo));
    if (dVentas.ok) setVentas(dVentas.ventas);
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter(
      (p) => p.referencia.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q)
    );
  }, [busqueda, productos]);

  const seleccionado = productos.find((p) => String(p.id) === String(productoId));

  async function confirmarVenta(e) {
    e.preventDefault();
    setError('');
    setMensaje('');

    if (!productoId) {
      setError('Selecciona un producto');
      return;
    }

    setGuardando(true);
    const res = await fetch('/api/ventas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ producto_id: Number(productoId), cantidad: Number(cantidad), nota }),
    });
    const data = await res.json();
    setGuardando(false);

    if (data.ok) {
      setMensaje('Venta registrada.');
      setProductoId('');
      setCantidad(1);
      setNota('');
      setBusqueda('');
      cargarTodo();
    } else {
      setError(data.error || 'No se pudo registrar la venta');
    }
  }

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '24px', maxWidth: '700px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>Venta de mostrador — Kennedy</h1>
        <a href="/">Inicio</a>
      </div>

      <form onSubmit={confirmarVenta} style={formStyle}>
        <label style={{ display: 'block', marginBottom: '10px' }}>
          Buscar producto (referencia o nombre)
          <input
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setProductoId('');
            }}
            style={input}
            placeholder="Escribe para buscar..."
          />
        </label>

        {busqueda && !productoId && (
          <div style={listaResultados}>
            {filtrados.slice(0, 8).map((p) => (
              <div
                key={p.id}
                onClick={() => {
                  setProductoId(String(p.id));
                  setBusqueda(`${p.referencia} - ${p.nombre}`);
                }}
                style={itemResultado}
              >
                {p.referencia} — {p.nombre} (stock: {p.stock})
              </div>
            ))}
            {filtrados.length === 0 && <div style={itemResultado}>Sin resultados</div>}
          </div>
        )}

        {seleccionado && (
          <p style={{ color: '#555' }}>
            Stock actual en Kennedy: <strong>{seleccionado.stock}</strong>
          </p>
        )}

        <label style={{ display: 'block', marginBottom: '10px' }}>
          Cantidad
          <input type="number" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} style={input} />
        </label>

        <label style={{ display: 'block', marginBottom: '10px' }}>
          Nota (opcional)
          <input value={nota} onChange={(e) => setNota(e.target.value)} style={input} />
        </label>

        {error && <p style={{ color: '#c00' }}>{error}</p>}
        {mensaje && <p style={{ color: '#080' }}>{mensaje}</p>}

        <button type="submit" disabled={guardando} style={btnPrimario}>
          {guardando ? 'Registrando...' : 'Confirmar venta'}
        </button>
      </form>

      <h3>Ventas de hoy</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
            <th style={th}>Hora</th>
            <th style={th}>Producto</th>
            <th style={th}>Cantidad</th>
            <th style={th}>Nota</th>
          </tr>
        </thead>
        <tbody>
          {ventas.map((v) => (
            <tr key={v.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={td}>
                {new Date(v.creado_en).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
              </td>
              <td style={td}>
                {v.referencia} — {v.nombre}
              </td>
              <td style={td}>{v.cantidad}</td>
              <td style={td}>{v.nota || '-'}</td>
            </tr>
          ))}
          {ventas.length === 0 && (
            <tr>
              <td style={td} colSpan={4}>
                Sin ventas registradas hoy.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}

const input = { display: 'block', width: '100%', padding: '8px', marginTop: '4px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' };
const formStyle = { background: '#f9f9f9', padding: '16px', borderRadius: '10px', marginBottom: '24px', border: '1px solid #eee' };
const th = { padding: '8px', fontSize: '14px', color: '#555' };
const td = { padding: '8px', fontSize: '14px' };
const btnPrimario = { padding: '8px 14px', borderRadius: '6px', border: 'none', background: '#111', color: '#fff', cursor: 'pointer' };
const listaResultados = { border: '1px solid #ddd', borderRadius: '6px', marginTop: '4px', marginBottom: '10px', maxHeight: '160px', overflowY: 'auto', background: '#fff' };
const itemResultado = { padding: '8px', cursor: 'pointer', borderBottom: '1px solid #eee' };
