'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';

const vacio = {
  id: null,
  referencia: '',
  nombre: '',
  descripcion: '',
  categoria_id: '',
  subcategoria_id: '',
  precio_venta: '',
  precio_costo: '',
  precio_distribuidor: '',
  activo: true,
  es_inventariable: true,
};

export default function ProductosPage() {
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [subcategorias, setSubcategorias] = useState([]);
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

  async function cargarCategorias() {
    const res = await fetch('/api/categorias');
    const data = await res.json();
    if (data.ok) setCategorias(data.categorias);
  }

  async function cargarSubcategorias(categoriaId) {
    if (!categoriaId) {
      setSubcategorias([]);
      return;
    }
    const res = await fetch(`/api/subcategorias?categoria_id=${categoriaId}`);
    const data = await res.json();
    if (data.ok) setSubcategorias(data.subcategorias);
  }

  useEffect(() => {
    cargarProductos();
    cargarCategorias();
  }, []);

  function nuevoProducto() {
    setForm(vacio);
    setSubcategorias([]);
    setError('');
    setMostrarForm(true);
  }

  function editarProducto(p) {
    setForm({
      id: p.id,
      referencia: p.referencia,
      nombre: p.nombre,
      descripcion: p.descripcion || '',
      categoria_id: p.categoria_id || '',
      subcategoria_id: p.subcategoria_id || '',
      precio_venta: p.precio_venta || '',
      precio_costo: p.precio_costo || '',
      precio_distribuidor: p.precio_distribuidor || '',
      activo: p.activo,
      es_inventariable: p.es_inventariable === undefined || p.es_inventariable === null ? true : p.es_inventariable,
    });
    setError('');
    setMostrarForm(true);
    cargarSubcategorias(p.categoria_id || '');
  }

  function cambiarCategoria(categoriaId) {
    setForm({ ...form, categoria_id: categoriaId, subcategoria_id: '' });
    cargarSubcategorias(categoriaId);
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

  function moneda(n) {
    return n ? `$${Number(n).toLocaleString('es-CO')}` : '-';
  }

  return (
    <Shell title="Productos">
      <div style={styles.header}>
        <h2 style={{ margin: 0 }}>Catálogo</h2>
        <button onClick={nuevoProducto} style={styles.btnPrimario}>+ Nuevo producto</button>
      </div>

      {mostrarForm && (
        <form onSubmit={guardar} style={styles.formCard}>
          <h3 style={{ marginTop: 0 }}>{form.id ? 'Editar producto' : 'Nuevo producto'}</h3>
          <div style={styles.grid2}>
            <label>
              Referencia
              <input required value={form.referencia} onChange={(e) => setForm({ ...form, referencia: e.target.value })} style={styles.input} />
            </label>
            <label>
              Nombre
              <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={styles.input} />
            </label>
            <label>
              Categoría
              <select value={form.categoria_id} onChange={(e) => cambiarCategoria(e.target.value)} style={styles.input}>
                <option value="">Sin categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </label>
            <label>
              Subcategoría
              <select
                value={form.subcategoria_id}
                onChange={(e) => setForm({ ...form, subcategoria_id: e.target.value })}
                style={styles.input}
                disabled={!form.categoria_id}
              >
                <option value="">Sin subcategoría</option>
                {subcategorias.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </label>
            <label>
              Precio de venta
              <input type="number" step="0.01" value={form.precio_venta} onChange={(e) => setForm({ ...form, precio_venta: e.target.value })} style={styles.input} />
            </label>
            <label>
              Precio de costo
              <input type="number" step="0.01" value={form.precio_costo} onChange={(e) => setForm({ ...form, precio_costo: e.target.value })} style={styles.input} />
            </label>
            <label>
              Precio de distribuidor
              <input type="number" step="0.01" value={form.precio_distribuidor} onChange={(e) => setForm({ ...form, precio_distribuidor: e.target.value })} style={styles.input} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '20px' }}>
              <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
              Activo
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '20px' }}>
              <input
                type="checkbox"
                checked={form.es_inventariable}
                onChange={(e) => setForm({ ...form, es_inventariable: e.target.checked })}
              />
              Es un producto de inventario (maneja stock)
            </label>
          </div>
          {!form.es_inventariable && (
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Al desmarcarlo, este producto se trata como un servicio: no maneja stock ni bloquea la venta por falta de existencias (por ejemplo servicio técnico o servicio de envío).
            </p>
          )}
          <label style={{ display: 'block', marginTop: '10px' }}>
            Descripción
            <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} style={{ ...styles.input, width: '100%', minHeight: '60px' }} />
          </label>

          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

          <div style={{ marginTop: '12px' }}>
            <button type="submit" disabled={guardando} style={styles.btnPrimario}>{guardando ? 'Guardando...' : 'Guardar'}</button>
            <button type="button" onClick={() => setMostrarForm(false)} style={styles.btnSecundario}>Cancelar</button>
          </div>
        </form>
      )}

      <div style={styles.tableCard}>
        {cargando ? (
          <p>Cargando...</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={styles.th}></th>
                <th style={styles.th}>Referencia</th>
                <th style={styles.th}>Nombre</th>
                <th style={styles.th}>Categoría</th>
                <th style={styles.th}>Precio venta</th>
                <th style={styles.th}>Precio distribuidor</th>
                <th style={styles.th}>Stock</th>
                <th style={styles.th}>Activo</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={styles.td}>
                    {p.imagen_key ? (
                      <img src={`/api/imagenes/${p.imagen_key}`} alt="" style={styles.miniatura} />
                    ) : (
                      <div style={styles.miniaturaVacia} />
                    )}
                  </td>
                  <td style={styles.td}>{p.referencia}</td>
                  <td style={styles.td}>
                    {p.nombre}
                    {p.es_inventariable === false && <span style={styles.tagServicio}>Servicio</span>}
                  </td>
                  <td style={styles.td}>{p.categoria_nombre || '-'}</td>
                  <td style={styles.td}>{moneda(p.precio_venta)}</td>
                  <td style={styles.td}>{moneda(p.precio_distribuidor)}</td>
                  <td style={styles.td}>{p.es_inventariable === false ? '—' : p.stock}</td>
                  <td style={styles.td}>{p.activo ? 'Sí' : 'No'}</td>
                  <td style={styles.td}>
                    <button onClick={() => editarProducto(p)} style={styles.btnSecundario}>Editar</button>
                  </td>
                </tr>
              ))}
              {productos.length === 0 && (
                <tr>
                  <td style={styles.td} colSpan={9}>No hay productos todavía.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  formCard: { background: '#fff', border: '1px solid var(--border)', padding: '20px', borderRadius: 'var(--radius)', marginBottom: '24px' },
  tableCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 16px' },
  input: { display: 'block', width: '100%', padding: '9px', marginTop: '4px', borderRadius: '8px', border: '1px solid var(--border)', boxSizing: 'border-box' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  th: { padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)' },
  td: { padding: '10px 8px', fontSize: '14px' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  btnSecundario: { padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', marginLeft: '8px', cursor: 'pointer' },
  miniatura: { width: '36px', height: '36px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)' },
  miniaturaVacia: { width: '36px', height: '36px', borderRadius: '6px', background: 'var(--bg)', border: '1px solid var(--border)' },
  tagServicio: {
    marginLeft: '8px',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--teal-dark)',
    background: 'var(--teal-light)',
    borderRadius: '999px',
    padding: '2px 8px',
  },
};
