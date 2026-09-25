'use client';

import { useEffect, useMemo, useState } from 'react';
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
  mostrar_en_tienda: true,
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

  const [imagenes, setImagenes] = useState([]);
  const [cargandoImagenes, setCargandoImagenes] = useState(false);
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [errorImagen, setErrorImagen] = useState('');
  const [procesandoImagenId, setProcesandoImagenId] = useState(null);
  const [portadaActual, setPortadaActual] = useState(null);

  // Búsqueda y paginación de la lista: antes se mostraban todos los
  // productos de una sola vez, lo que hacía la página larguísima y además
  // escondía el formulario de edición (que aparece arriba de la tabla) si
  // se hacía clic en "Editar" estando muy abajo en la lista.
  const [busqueda, setBusqueda] = useState('');
  const [porPagina, setPorPagina] = useState(100);
  const [pagina, setPagina] = useState(1);

  // Ficha de detalle de un producto (se abre al hacer clic en el nombre o
  // en la referencia): muestra la info completa, incluida la foto y el
  // costo (promedio) sin necesidad de entrar a editar.
  const [detalleProducto, setDetalleProducto] = useState(null);

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

  useEffect(() => {
    if (form.id) {
      const p = productos.find((x) => x.id === form.id);
      if (p) setPortadaActual(p.imagen_key || null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos, form.id]);

  function nuevoProducto() {
    setForm(vacio);
    setSubcategorias([]);
    setImagenes([]);
    setErrorImagen('');
    setError('');
    setMostrarForm(true);
  }

  async function cargarImagenes(productoId) {
    setCargandoImagenes(true);
    const res = await fetch(`/api/productos/${productoId}/imagenes`);
    const data = await res.json();
    if (data.ok) setImagenes(data.imagenes);
    setCargandoImagenes(false);
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
      mostrar_en_tienda: p.mostrar_en_tienda === undefined || p.mostrar_en_tienda === null ? true : p.mostrar_en_tienda,
    });
    setError('');
    setErrorImagen('');
    setPortadaActual(p.imagen_key || null);
    setMostrarForm(true);
    cargarSubcategorias(p.categoria_id || '');
    cargarImagenes(p.id);
  }

  async function subirImagen(e) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo || !form.id) return;
    setErrorImagen('');
    setSubiendoImagen(true);
    const cuerpo = new FormData();
    cuerpo.append('imagen', archivo);
    const res = await fetch(`/api/productos/${form.id}/imagenes`, { method: 'POST', body: cuerpo });
    const data = await res.json();
    setSubiendoImagen(false);
    if (data.ok) {
      cargarImagenes(form.id);
      cargarProductos();
    } else {
      setErrorImagen(data.error || 'No se pudo subir la imagen');
    }
  }

  async function eliminarImagen(imgId) {
    if (!window.confirm('¿Eliminar esta foto?')) return;
    setProcesandoImagenId(imgId);
    const res = await fetch(`/api/productos/${form.id}/imagenes/${imgId}`, { method: 'DELETE' });
    const data = await res.json();
    setProcesandoImagenId(null);
    if (data.ok) {
      cargarImagenes(form.id);
      cargarProductos();
    } else {
      setErrorImagen(data.error || 'No se pudo eliminar la imagen');
    }
  }

  async function hacerPortada(imgId) {
    setProcesandoImagenId(imgId);
    const res = await fetch(`/api/productos/${form.id}/imagenes/${imgId}`, { method: 'PATCH' });
    const data = await res.json();
    setProcesandoImagenId(null);
    if (data.ok) {
      cargarImagenes(form.id);
      cargarProductos();
    } else {
      setErrorImagen(data.error || 'No se pudo cambiar la portada');
    }
  }

  function cambiarCategoria(categoriaId) {
    setForm({ ...form, categoria_id: categoriaId, subcategoria_id: '' });
    cargarSubcategorias(categoriaId);
  }

  function abrirDetalle(p) {
    setDetalleProducto(p);
  }

  function cerrarDetalle() {
    setDetalleProducto(null);
  }

  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter(
      (p) => (p.referencia || '').toLowerCase().includes(q) || (p.nombre || '').toLowerCase().includes(q)
    );
  }, [productos, busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(productosFiltrados.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const productosPagina = productosFiltrados.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);

  useEffect(() => {
    setPagina(1);
  }, [busqueda, porPagina]);

  async function guardar(e) {
    e.preventDefault();
    setError('');

    if (form.es_inventariable && !(Number(form.precio_costo) > 0)) {
      setError('El precio de costo es obligatorio para un producto inventariable');
      return;
    }

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
        // El formulario se muestra como ventana emergente centrada (en vez de
        // aparecer arriba de la tabla) para que, sin importar qué tan abajo
        // esté la persona en una lista larga, se note claramente que sí pasó
        // algo al tocar el lápiz de editar.
        <div style={styles.overlay} onMouseDown={() => setMostrarForm(false)}>
        <form onSubmit={guardar} onMouseDown={(e) => e.stopPropagation()} style={{ ...styles.formCard, ...styles.formModal }}>
          <h3 style={{ marginTop: 0 }}>{form.id ? 'Editar producto' : 'Nuevo producto'}</h3>

          <label style={{ display: 'block', marginBottom: '8px' }}>Tipo de producto</label>
          <div style={styles.tipoSelector}>
            <button
              type="button"
              onClick={() => setForm({ ...form, es_inventariable: true })}
              style={{ ...styles.btnTipo, ...(form.es_inventariable ? styles.btnTipoActivo : {}) }}
            >
              Producto inventariable
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, es_inventariable: false, precio_costo: '' })}
              style={{ ...styles.btnTipo, ...(!form.es_inventariable ? styles.btnTipoActivo : {}) }}
            >
              Servicio
            </button>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: '16px' }}>
            {form.es_inventariable
              ? 'Maneja stock y precio de compra, y no se puede vender si no hay existencias en Principal.'
              : 'No maneja stock ni precio de compra, y nunca bloquea la venta por falta de existencias (por ejemplo servicio técnico o servicio de envío).'}
          </p>

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
            {form.es_inventariable && (
              <label>
                Precio de costo *
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.precio_costo}
                  onChange={(e) => setForm({ ...form, precio_costo: e.target.value })}
                  style={styles.input}
                />
              </label>
            )}
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
                checked={form.mostrar_en_tienda}
                onChange={(e) => setForm({ ...form, mostrar_en_tienda: e.target.checked })}
              />
              Mostrar en la tienda (geekstore.com.co)
            </label>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '-8px', marginBottom: '10px' }}>
            Desmárcalo para productos que quieras manejar solo aquí en el POS (o solo con
            distribuidores) sin que aparezcan en la página pública — no afecta el portal de
            distribuidores, que sigue su propio filtro de precio de distribuidor.
          </p>
          <label style={{ display: 'block', marginTop: '10px' }}>
            Descripción
            <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} style={{ ...styles.input, width: '100%', minHeight: '60px' }} />
          </label>

          <div style={{ marginTop: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px' }}>Fotos</label>
            {!form.id ? (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Guarda el producto primero para poder agregarle fotos.
              </p>
            ) : (
              <>
                {cargandoImagenes ? (
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Cargando fotos...</p>
                ) : (
                  <div style={styles.galeria}>
                    {imagenes.map((img) => {
                      const esPortada = img.imagen_key === portadaActual;
                      const procesando = procesandoImagenId === img.id;
                      return (
                        <div key={img.id} style={styles.fotoItem}>
                          <img src={`/api/imagenes/${img.imagen_key}`} alt="" style={styles.fotoMiniatura} />
                          {esPortada && <span style={styles.badgePortada}>Portada</span>}
                          <div style={styles.fotoAcciones}>
                            {!esPortada && (
                              <button
                                type="button"
                                onClick={() => hacerPortada(img.id)}
                                disabled={procesando}
                                style={styles.btnFotoAccion}
                              >
                                Hacer portada
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => eliminarImagen(img.id)}
                              disabled={procesando}
                              style={{ ...styles.btnFotoAccion, color: 'var(--danger)' }}
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {imagenes.length === 0 && (
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Este producto no tiene fotos todavía.</p>
                    )}
                  </div>
                )}

                <label style={styles.btnSubirFoto}>
                  {subiendoImagen ? 'Subiendo...' : '+ Agregar foto'}
                  <input type="file" accept="image/*" onChange={subirImagen} disabled={subiendoImagen} style={{ display: 'none' }} />
                </label>
                {errorImagen && <p style={{ color: 'var(--danger)', fontSize: '13px' }}>{errorImagen}</p>}
              </>
            )}
          </div>

          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

          <div style={{ marginTop: '12px' }}>
            <button type="submit" disabled={guardando} style={styles.btnPrimario}>{guardando ? 'Guardando...' : 'Guardar'}</button>
            <button type="button" onClick={() => setMostrarForm(false)} style={styles.btnSecundario}>Cancelar</button>
          </div>
        </form>
        </div>
      )}

      <div style={styles.barraLista}>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por referencia o nombre..."
          style={styles.buscador}
        />
        <label style={styles.selectorPorPagina}>
          Ver por página
          <select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} style={styles.selectPorPagina}>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={300}>300</option>
          </select>
        </label>
      </div>

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
                <th style={styles.th}>Costo (promedio)</th>
                <th style={styles.th}>Precio distribuidor</th>
                <th style={styles.th}>Stock</th>
                <th style={styles.th}>Activo</th>
                <th style={styles.th}>En tienda</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {productosPagina.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={styles.td}>
                    {p.imagen_key ? (
                      <img src={`/api/imagenes/${p.imagen_key}`} alt="" style={styles.miniatura} />
                    ) : (
                      <div style={styles.miniaturaVacia} />
                    )}
                  </td>
                  <td style={styles.td}>
                    <span onClick={() => abrirDetalle(p)} style={styles.clicable}>{p.referencia}</span>
                  </td>
                  <td style={styles.td}>
                    <span onClick={() => abrirDetalle(p)} style={styles.clicable}>{p.nombre}</span>
                    {p.es_inventariable === false && <span style={styles.tagServicio}>Servicio</span>}
                  </td>
                  <td style={styles.td}>{p.categoria_nombre || '-'}</td>
                  <td style={styles.td}>{moneda(p.precio_venta)}</td>
                  <td style={styles.td}>{p.es_inventariable === false ? '—' : moneda(p.precio_costo)}</td>
                  <td style={styles.td}>{moneda(p.precio_distribuidor)}</td>
                  <td style={styles.td}>{p.es_inventariable === false ? '—' : p.stock}</td>
                  <td style={styles.td}>{p.activo ? 'Sí' : 'No'}</td>
                  <td style={styles.td}>
                    {p.mostrar_en_tienda === false ? (
                      <span style={styles.tagOculto}>No</span>
                    ) : (
                      'Sí'
                    )}
                  </td>
                  <td style={styles.td}>
                    <button onClick={() => editarProducto(p)} title="Editar producto" style={styles.btnLapiz}>✏️</button>
                  </td>
                </tr>
              ))}
              {productosPagina.length === 0 && (
                <tr>
                  <td style={styles.td} colSpan={11}>
                    {productos.length === 0 ? 'No hay productos todavía.' : 'Ningún producto coincide con la búsqueda.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {!cargando && productosFiltrados.length > 0 && (
          <div style={styles.paginacion}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
              {productosFiltrados.length} producto(s) · página {paginaSegura} de {totalPaginas}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setPagina((n) => Math.max(1, n - 1))}
                disabled={paginaSegura <= 1}
                style={styles.btnSecundario}
              >
                Anterior
              </button>
              <button
                onClick={() => setPagina((n) => Math.min(totalPaginas, n + 1))}
                disabled={paginaSegura >= totalPaginas}
                style={styles.btnSecundario}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {detalleProducto && (
        <div style={styles.overlay} onMouseDown={cerrarDetalle}>
          <div style={styles.modalDetalle} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <h3 style={{ marginTop: 0, marginBottom: '2px' }}>{detalleProducto.nombre}</h3>
              <button onClick={cerrarDetalle} style={styles.btnCerrarModal}>✕</button>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginTop: 0, fontSize: '13px' }}>
              Ref. {detalleProducto.referencia}
              {detalleProducto.es_inventariable === false && <span style={styles.tagServicio}>Servicio</span>}
            </p>

            {detalleProducto.imagen_key ? (
              <img src={`/api/imagenes/${detalleProducto.imagen_key}`} alt="" style={styles.fotoDetalle} />
            ) : (
              <div style={{ ...styles.fotoDetalle, ...styles.fotoDetalleVacia }}>Sin foto</div>
            )}

            <div style={styles.filaDetalle}><span>Categoría</span><strong>{detalleProducto.categoria_nombre || '-'}</strong></div>
            {detalleProducto.subcategoria_nombre && (
              <div style={styles.filaDetalle}><span>Subcategoría</span><strong>{detalleProducto.subcategoria_nombre}</strong></div>
            )}
            <div style={styles.filaDetalle}><span>Precio de venta</span><strong>{moneda(detalleProducto.precio_venta)}</strong></div>
            {detalleProducto.es_inventariable !== false && (
              <div style={styles.filaDetalle}><span>Costo (promedio)</span><strong>{moneda(detalleProducto.precio_costo)}</strong></div>
            )}
            <div style={styles.filaDetalle}><span>Precio distribuidor</span><strong>{moneda(detalleProducto.precio_distribuidor)}</strong></div>
            {detalleProducto.es_inventariable === false ? (
              <div style={styles.filaDetalle}><span>Stock</span><strong>—</strong></div>
            ) : (
              <>
                <div style={styles.filaDetalle}><span>Stock Principal</span><strong>{detalleProducto.stock_principal ?? '-'}</strong></div>
                <div style={styles.filaDetalle}><span>Stock Distribuidor</span><strong>{detalleProducto.stock_distribuidor ?? '-'}</strong></div>
              </>
            )}
            <div style={styles.filaDetalle}><span>Activo</span><strong>{detalleProducto.activo ? 'Sí' : 'No'}</strong></div>
            <div style={styles.filaDetalle}>
              <span>Mostrar en la tienda</span>
              <strong>{detalleProducto.mostrar_en_tienda === false ? 'No' : 'Sí'}</strong>
            </div>
            {detalleProducto.descripcion && (
              <div style={{ marginTop: '10px' }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '2px' }}>Descripción</div>
                <div>{detalleProducto.descripcion}</div>
              </div>
            )}

            <div style={{ marginTop: '16px' }}>
              <button
                onClick={() => {
                  cerrarDetalle();
                  editarProducto(detalleProducto);
                }}
                style={styles.btnPrimario}
              >
                Editar este producto
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  formCard: { background: '#fff', border: '1px solid var(--border)', padding: '20px', borderRadius: 'var(--radius)', marginBottom: '24px' },
  // El formulario de nuevo/editar producto y la ficha de detalle se muestran
  // como ventana emergente centrada sobre un fondo oscuro.
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
  formModal: {
    marginBottom: 0,
    width: '640px',
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
    width: '420px',
    maxWidth: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
  },
  btnCerrarModal: { border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--text-secondary)' },
  fotoDetalle: { width: '100%', height: '200px', objectFit: 'contain', background: 'var(--bg)', borderRadius: '8px', margin: '10px 0' },
  fotoDetalleVacia: { display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '13px' },
  filaDetalle: { display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '14px', borderBottom: '1px solid var(--border)' },
  barraLista: { display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' },
  buscador: { flex: 1, minWidth: '220px', padding: '10px 14px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxSizing: 'border-box', background: '#fff' },
  selectorPorPagina: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' },
  selectPorPagina: { padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px' },
  clicable: { cursor: 'pointer', color: 'var(--teal-dark)' },
  btnLapiz: { border: '1px solid var(--border)', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', padding: '6px 9px', lineHeight: 1 },
  paginacion: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 4px' },
  tableCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 16px' },
  input: { display: 'block', width: '100%', padding: '9px', marginTop: '4px', borderRadius: '8px', border: '1px solid var(--border)', boxSizing: 'border-box' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  tipoSelector: { display: 'flex', gap: '10px', marginBottom: '4px' },
  btnTipo: {
    flex: 1,
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  btnTipoActivo: { background: 'var(--teal)', color: '#fff', border: '1px solid var(--teal)' },
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
  tagOculto: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--danger)',
    background: '#fdeaea',
    borderRadius: '999px',
    padding: '2px 8px',
  },
  galeria: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    marginBottom: '10px',
  },
  fotoItem: {
    position: 'relative',
    width: '120px',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '6px',
    textAlign: 'center',
    background: 'var(--bg)',
  },
  fotoMiniatura: {
    width: '100%',
    height: '90px',
    objectFit: 'contain',
    background: '#fff',
    borderRadius: '6px',
  },
  badgePortada: {
    display: 'inline-block',
    marginTop: '4px',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--teal-dark)',
    background: 'var(--teal-light)',
    borderRadius: '999px',
    padding: '1px 8px',
  },
  fotoAcciones: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginTop: '6px',
  },
  btnFotoAccion: {
    border: 'none',
    background: 'none',
    color: 'var(--teal-dark)',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '2px 0',
  },
  btnSubirFoto: {
    display: 'inline-block',
    padding: '9px 16px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--teal-dark)',
  },
};
