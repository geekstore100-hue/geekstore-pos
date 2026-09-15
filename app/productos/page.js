'use client';

import { useEffect, useState } from 'react';

const vacio = {
  id: null,
  referencia: '',
  nombre: '',
  descripcion: '',
  categoria: '',
  precio_venta: '',
  precio_costo: '',
  activo: true,
};

export default function ProductosPage() {
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState(vacio);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function cargarProductos() {
    setCargando(true);
    const res = await fetch('/api/productos');
    const data = await res.json();
    if (data.ok) setProductos(data.productos);
    setCargando(false);
  }

  useEffect(() => {
    cargarProductos();
  }, []);

  function nuevoProducto() {
    setForm(vacio);
    setError('');
    setMostrarForm(true);
  }

  function editarProducto(p) {
    setForm({
      id: p.id,
      referencia: p.referencia,
      nombre: p.nombre,
      descripcion: p.descripcion || '',
      categoria: p.categoria || '',
      precio_venta: p.precio_venta || '',
      precio_costo: p.precio_costo || '',
      activo: p.activo,
    });
    setError('');
    setMostrarForm(true);
  }

  async function guardar(e) {
    e.preventDefault();
    setError('');
    setGuardando(true);

    const url = form.id ? `/api/productos/${form.id}` : '/api/productos';
    const method = form.id ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    setGuardando(false);

    if (data.ok) {
      setMostrarForm(false);
      cargarProductos();
    } else {
      setError(data.error || 'No se pudo guardar');
    }
  }

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>Productos — Kennedy</h1>
        <div>
          <a href="/" style={{ marginRight: '16px' }}>Inicio</a>
          <button onClick={nuevoProducto} style={btnPrimario}>+ Nuevo producto</button>
        </div>
      </div>

      {mostrarForm && (
        <form onSubmit={guardar} style={formStyle}>
          <h3 style={{ marginTop: 0 }}>{form.id ? 'Editar producto' : 'Nuevo producto'}</h3>
          <div style={grid2}>
            <label>
              Referencia
              <input required value={form.referencia} onChange={e => setForm({ ...form, referencia: e.target.value })} style={input} />
            </label>
            <label>
              Nombre
              <input required value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} style={input} />
            </label>
            <label>
              Categoría
              <input value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} style={input} />
            </label>
            <label>
              Precio de venta
              <input type="number" step="0.01" value={form.precio_venta} onChange={e => setForm({ ...form, precio_venta: e.target.value })} style={input} />
            </label>
            <label>
              Precio de costo
              <input type="number" step="0.01" value={form.precio_costo} onChange={e => setForm({ ...form, precio_costo: e.target.value })} style={input} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '20px' }}>
              <input type="checkbox" checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} />
              Activo
            </label>
          </div>
          <label style={{ display: 'block', marginTop: '10px' }}>
            Descripción
            <textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} style={{ ...input, width: '100%', minHeight: '60px' }} />
          </label>

          {error && <p style={{ color: '#c00' }}>{error}</p>}

          <div style={{ marginTop: '12px' }}>
            <button type="submit" disabled={guardando} style={btnPrimario}>{guardando ? 'Guardando...' : 'Guardar'}</button>
            <button type="button" onClick={() => setMostrarForm(false)} style={btnSecundario}>Cancelar</button>
          </div>
        </form>
      )}

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={th}>Referencia</th>
              <th style={th}>Nombre</th>
              <th style={th}>Categoría</th>
              <th style={th}>Precio venta</th>
              <th style={th}>Stock Kennedy</th>
              <th style={th}>Activo</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {productos.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={td}>{p.referencia}</td>
                <td style={td}>{p.nombre}</td>
                <td style={td}>{p.categoria}</td>
                <td style={td}>{p.precio_venta ? `$${Number(p.precio_venta).toLocaleString('es-CO')}` : '-'}</td>
                <td style={td}>{p.stock}</td>
                <td style={td}>{p.activo ? 'Sí' : 'No'}</td>
                <td style={td}><button onClick={() => editarProducto(p)} style={btnSecundario}>Editar</button></td>
              </tr>
            ))}
            {productos.length === 0 && (
              <tr><td style={td} colSpan={7}>No hay productos todavía.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </main>
  );
}

const input = { display: 'block', width: '100%', padding: '8px', marginTop: '4px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' };
const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' };
const formStyle = { background: '#f9f9f9', padding: '16px', borderRadius: '10px', marginBottom: '24px', border: '1px solid #eee' };
const th = { padding: '8px', fontSize: '14px', color: '#555' };
const td = { padding: '8px', fontSize: '14px' };
const btnPrimario = { padding: '8px 14px', borderRadius: '6px', border: 'none', background: '#111', color: '#fff', cursor: 'pointer' };
const btnSecundario = { padding: '8px 14px', borderRadius: '6px', border: '1px solid #ccc', background: '#fff', marginLeft: '8px', cursor: 'pointer' };
