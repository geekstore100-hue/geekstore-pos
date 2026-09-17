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
    busquedaProducto: '',
    precio_unitario: '',
    descuento_porcentaje: '',
    cantidad: 1,
    observaciones: '',
  };
}

const productoVacio = { nombre: '', referencia: '', categoria: '', precio_venta: '', precio_costo: '', descripcion: '' };

const proveedorVacio = {
  tipo_identificacion: 'CC',
  identificacion: '',
  nombre: '',
  correo: '',
  telefono: '',
  direccion: '',
  ciudad: '',
};

export default function EntradasPage() {
  const [productos, setProductos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [bodegas, setBodegas] = useState([]);
  const [comprasRecientes, setComprasRecientes] = useState([]);
  const [carrito, setCarrito] = useState([nuevaLinea()]);
  const [filaBuscando, setFilaBuscando] = useState(null);

  const [numeroFactura, setNumeroFactura] = useState('');
  const [fechaCompra, setFechaCompra] = useState(hoyISO());
  const [fechaVencimiento, setFechaVencimiento] = useState(hoyISO());
  const [bodegaId, setBodegaId] = useState('');
  const [notas, setNotas] = useState('');

  const [proveedorId, setProveedorId] = useState('');

  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Modal de creación de producto
  const [modalAbierto, setModalAbierto] = useState(false);
  const [filaModal, setFilaModal] = useState(null);
  const [formProducto, setFormProducto] = useState(productoVacio);
  const [errorModal, setErrorModal] = useState('');
  const [guardandoProducto, setGuardandoProducto] = useState(false);

  // Panel de creación de proveedor
  const [panelProveedorAbierto, setPanelProveedorAbierto] = useState(false);
  const [formProveedor, setFormProveedor] = useState(proveedorVacio);
  const [errorProveedor, setErrorProveedor] = useState('');
  const [guardandoProveedor, setGuardandoProveedor] = useState(false);

  async function cargarTodo() {
    const [rProd, rProv, rBod, rCompras] = await Promise.all([
      fetch('/api/productos'),
      fetch('/api/proveedores'),
      fetch('/api/bodegas'),
      fetch('/api/compras'),
    ]);
    const dProd = await rProd.json();
    const dProv = await rProv.json();
    const dBod = await rBod.json();
    const dCompras = await rCompras.json();
    if (dProd.ok) setProductos(dProd.productos.filter((p) => p.activo));
    if (dProv.ok) setProveedores(dProv.proveedores);
    if (dBod.ok) {
      setBodegas(dBod.bodegas);
      setBodegaId((actual) => {
        if (actual) return actual;
        const principal = dBod.bodegas.find((b) => b.nombre === 'Principal');
        return String((principal || dBod.bodegas[0])?.id || '');
      });
    }
    if (dCompras.ok) setComprasRecientes(dCompras.compras);
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  function actualizarLinea(key, campo, valor) {
    setCarrito((prev) => prev.map((l) => (l._key === key ? { ...l, [campo]: valor } : l)));
  }

  function buscarEnLinea(key, texto) {
    setCarrito((prev) => prev.map((l) => (l._key === key ? { ...l, busquedaProducto: texto, producto_id: '' } : l)));
    setFilaBuscando(key);
  }

  function resultadosPara(texto) {
    const q = texto.trim().toLowerCase();
    if (!q) return productos.slice(0, 8);
    return productos.filter((p) => p.referencia.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q)).slice(0, 8);
  }

  function seleccionarProducto(key, producto) {
    setCarrito((prev) =>
      prev.map((l) =>
        l._key === key
          ? {
              ...l,
              producto_id: String(producto.id),
              busquedaProducto: `${producto.referencia} - ${producto.nombre}`,
              precio_unitario: l.precio_unitario || producto.precio_costo || '',
            }
          : l
      )
    );
    setFilaBuscando(null);
  }

  function abrirModalNuevoProducto(key, textoBusqueda) {
    setFilaModal(key);
    setFormProducto({ ...productoVacio, nombre: textoBusqueda || '' });
    setErrorModal('');
    setModalAbierto(true);
    setFilaBuscando(null);
  }

  function cerrarModal() {
    setModalAbierto(false);
    setFilaModal(null);
    setFormProducto(productoVacio);
    setErrorModal('');
  }

  function abrirPanelNuevoProveedor() {
    setFormProveedor(proveedorVacio);
    setErrorProveedor('');
    setPanelProveedorAbierto(true);
  }

  function cerrarPanelProveedor() {
    setPanelProveedorAbierto(false);
    setFormProveedor(proveedorVacio);
    setErrorProveedor('');
  }

  async function crearProveedor() {
    setErrorProveedor('');
    if (!formProveedor.nombre.trim() || !formProveedor.identificacion.trim()) {
      setErrorProveedor('Nombre e identificación son obligatorios');
      return;
    }

    setGuardandoProveedor(true);
    const res = await fetch('/api/proveedores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo_identificacion: formProveedor.tipo_identificacion,
        identificacion: formProveedor.identificacion.trim(),
        nombre: formProveedor.nombre.trim(),
        correo: formProveedor.correo,
        telefono: formProveedor.telefono,
        direccion: formProveedor.direccion,
        ciudad: formProveedor.ciudad,
      }),
    });
    const data = await res.json();
    setGuardandoProveedor(false);

    if (!data.ok) {
      setErrorProveedor(data.error || 'No se pudo crear el proveedor');
      return;
    }

    const rProv = await fetch('/api/proveedores');
    const dProv = await rProv.json();
    let nuevoId = data.proveedor?.id ?? null;
    if (dProv.ok) {
      setProveedores(dProv.proveedores);
      if (!nuevoId) {
        const encontrado = dProv.proveedores.find((p) => p.identificacion === formProveedor.identificacion.trim());
        nuevoId = encontrado?.id ?? null;
      }
    }

    if (nuevoId) setProveedorId(String(nuevoId));
    cerrarPanelProveedor();
  }

  async function crearProducto() {
    setErrorModal('');
    if (!formProducto.nombre.trim() || !formProducto.referencia.trim()) {
      setErrorModal('Nombre y referencia son obligatorios');
      return;
    }

    setGuardandoProducto(true);
    const res = await fetch('/api/productos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referencia: formProducto.referencia.trim(),
        nombre: formProducto.nombre.trim(),
        categoria: formProducto.categoria,
        precio_venta: formProducto.precio_venta || '',
        precio_costo: formProducto.precio_costo || '',
        descripcion: formProducto.descripcion,
        activo: true,
      }),
    });
    const data = await res.json();
    setGuardandoProducto(false);

    if (!data.ok) {
      setErrorModal(data.error || 'No se pudo crear el producto');
      return;
    }

    const rProd = await fetch('/api/productos');
    const dProd = await rProd.json();
    let nuevoId = data.producto?.id ?? data.id ?? null;
    if (dProd.ok) {
      setProductos(dProd.productos.filter((p) => p.activo));
      if (!nuevoId) {
        const encontrado = dProd.productos.find((p) => p.referencia === formProducto.referencia.trim());
        nuevoId = encontrado?.id ?? null;
      }
    }

    if (filaModal && nuevoId) {
      setCarrito((prev) =>
        prev.map((l) =>
          l._key === filaModal
            ? {
                ...l,
                producto_id: String(nuevoId),
                busquedaProducto: `${formProducto.referencia.trim()} - ${formProducto.nombre.trim()}`,
                precio_unitario: l.precio_unitario || formProducto.precio_costo || '',
              }
            : l
        )
      );
    }

    cerrarModal();
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

  const proveedorSeleccionado = proveedores.find((p) => String(p.id) === String(proveedorId));

  const lineasValidas = carrito.filter((l) => l.producto_id);
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
    if (!proveedorId) {
      setError('Selecciona un proveedor o crea uno nuevo');
      return;
    }
    if (!bodegaId) {
      setError('Selecciona una bodega');
      return;
    }

    setGuardando(true);
    const res = await fetch('/api/compras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proveedor_id: Number(proveedorId),
        numero_factura: numeroFactura,
        fecha_compra: fechaCompra,
        fecha_vencimiento: fechaVencimiento,
        bodega_id: Number(bodegaId),
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

  // Formatea un valor numérico con separador de miles (punto), estilo colombiano: 25000 -> "25.000"
  function formatearMiles(valor) {
    const soloDigitos = String(valor ?? '').replace(/\D/g, '');
    if (!soloDigitos) return '';
    return Number(soloDigitos).toLocaleString('es-CO');
  }

  // Toma lo que el usuario escribió, se queda solo con los dígitos, y actualiza la línea con el número "crudo"
  function actualizarPrecioLinea(key, textoEscrito) {
    const soloDigitos = textoEscrito.replace(/\D/g, '');
    actualizarLinea(key, 'precio_unitario', soloDigitos);
  }

  return (
    <Shell title="Compras">
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
              <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} style={styles.inputCampo}>
                <option value="">Seleccionar</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={abrirPanelNuevoProveedor} style={styles.linkBtn}>+ Nuevo proveedor</button>
          </div>
          <label style={styles.labelCampo}>
            Identificación
            <input value={proveedorSeleccionado?.identificacion || ''} style={styles.inputCampo} disabled />
          </label>
          <label style={styles.labelCampo}>
            Teléfono
            <input value={proveedorSeleccionado?.telefono || ''} style={styles.inputCampo} disabled />
          </label>
        </div>

        <div style={styles.grid2}>
          <label style={styles.labelCampo}>
            Fecha de vencimiento *
            <input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} style={styles.inputCampo} />
          </label>
          <label style={styles.labelCampo}>
            Bodega *
            <select value={bodegaId} onChange={(e) => setBodegaId(e.target.value)} style={styles.inputCampo}>
              <option value="">Seleccionar</option>
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>{b.nombre}</option>
              ))}
            </select>
          </label>
        </div>

        <h3 style={styles.subtitulo}>Productos comprados</h3>
        <div>
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
                  <td style={{ ...styles.td, minWidth: '240px', position: 'relative' }}>
                    <input
                      value={l.busquedaProducto}
                      onChange={(e) => buscarEnLinea(l._key, e.target.value)}
                      onFocus={() => setFilaBuscando(l._key)}
                      onBlur={() => setTimeout(() => setFilaBuscando((actual) => (actual === l._key ? null : actual)), 150)}
                      placeholder="Escribe referencia o nombre..."
                      style={styles.inputCampo}
                    />
                    {filaBuscando === l._key && (
                      <div style={styles.listaResultados}>
                        {resultadosPara(l.busquedaProducto).map((p) => (
                          <div
                            key={p.id}
                            onMouseDown={() => seleccionarProducto(l._key, p)}
                            style={styles.itemResultado}
                          >
                            {p.referencia} — {p.nombre}
                          </div>
                        ))}
                        {resultadosPara(l.busquedaProducto).length === 0 && (
                          <div style={{ ...styles.itemResultado, color: 'var(--text-secondary)' }}>Sin resultados</div>
                        )}
                        <div
                          onMouseDown={() => abrirModalNuevoProducto(l._key, l.busquedaProducto)}
                          style={{ ...styles.itemResultado, color: 'var(--teal-dark)', fontWeight: 600 }}
                        >
                          + Crear nuevo producto
                        </div>
                      </div>
                    )}
                  </td>
                  <td style={styles.td}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatearMiles(l.precio_unitario)}
                      onChange={(e) => actualizarPrecioLinea(l._key, e.target.value)}
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

      {modalAbierto && (
        <div style={styles.overlay} onMouseDown={cerrarModal}>
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Nuevo producto</h3>

            <div style={styles.grid2}>
              <label style={styles.labelCampo}>
                Nombre *
                <input
                  value={formProducto.nombre}
                  onChange={(e) => setFormProducto({ ...formProducto, nombre: e.target.value })}
                  style={styles.inputCampo}
                />
              </label>
              <label style={styles.labelCampo}>
                Referencia *
                <input
                  value={formProducto.referencia}
                  onChange={(e) => setFormProducto({ ...formProducto, referencia: e.target.value })}
                  style={styles.inputCampo}
                />
              </label>
            </div>

            <div style={styles.grid2}>
              <label style={styles.labelCampo}>
                Categoría
                <input
                  value={formProducto.categoria}
                  onChange={(e) => setFormProducto({ ...formProducto, categoria: e.target.value })}
                  style={styles.inputCampo}
                />
              </label>
              <label style={styles.labelCampo}>
                Precio de venta
                <input
                  type="number"
                  step="0.01"
                  value={formProducto.precio_venta}
                  onChange={(e) => setFormProducto({ ...formProducto, precio_venta: e.target.value })}
                  style={styles.inputCampo}
                />
              </label>
            </div>

            <label style={styles.labelCampo}>
              Costo inicial (opcional — se usa como precio de esta línea de compra si no lo escribes tú)
              <input
                type="number"
                step="0.01"
                value={formProducto.precio_costo}
                onChange={(e) => setFormProducto({ ...formProducto, precio_costo: e.target.value })}
                style={styles.inputCampo}
              />
            </label>

            <label style={styles.labelCampo}>
              Descripción
              <textarea
                value={formProducto.descripcion}
                onChange={(e) => setFormProducto({ ...formProducto, descripcion: e.target.value })}
                style={{ ...styles.inputCampo, minHeight: '60px' }}
              />
            </label>

            {errorModal && <p style={{ color: 'var(--danger)' }}>{errorModal}</p>}

            <div style={styles.filaBotones}>
              <button type="button" onClick={cerrarModal} style={styles.btnSecundario}>Cancelar</button>
              <button type="button" onClick={crearProducto} disabled={guardandoProducto} style={styles.btnPrimario}>
                {guardandoProducto ? 'Creando...' : 'Crear producto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {panelProveedorAbierto && (
        <div style={styles.overlay} onMouseDown={cerrarPanelProveedor}>
          <div style={styles.panelLateral} onMouseDown={(e) => e.stopPropagation()}>
            <div style={styles.panelHeader}>
              <h3 style={{ margin: 0 }}>Nuevo proveedor</h3>
              <button type="button" onClick={cerrarPanelProveedor} style={styles.btnCerrarPanel}>×</button>
            </div>

            <h4 style={styles.subtitulo}>Datos generales</h4>

            <label style={styles.labelCampo}>
              Tipo de identificación *
              <select
                value={formProveedor.tipo_identificacion}
                onChange={(e) => setFormProveedor({ ...formProveedor, tipo_identificacion: e.target.value })}
                style={styles.inputCampo}
              >
                <option value="CC">CC - Cédula de ciudadanía</option>
                <option value="NIT">NIT - Número de identificación tributaria</option>
              </select>
            </label>

            <label style={styles.labelCampo}>
              Identificación *
              <input
                value={formProveedor.identificacion}
                onChange={(e) => setFormProveedor({ ...formProveedor, identificacion: e.target.value })}
                style={styles.inputCampo}
              />
            </label>

            <label style={styles.labelCampo}>
              {formProveedor.tipo_identificacion === 'NIT' ? 'Razón social *' : 'Nombre completo *'}
              <input
                value={formProveedor.nombre}
                onChange={(e) => setFormProveedor({ ...formProveedor, nombre: e.target.value })}
                style={styles.inputCampo}
              />
            </label>

            <div style={styles.grid2}>
              <label style={styles.labelCampo}>
                Correo
                <input
                  value={formProveedor.correo}
                  onChange={(e) => setFormProveedor({ ...formProveedor, correo: e.target.value })}
                  style={styles.inputCampo}
                />
              </label>
              <label style={styles.labelCampo}>
                Teléfono
                <input
                  value={formProveedor.telefono}
                  onChange={(e) => setFormProveedor({ ...formProveedor, telefono: e.target.value })}
                  style={styles.inputCampo}
                />
              </label>
            </div>

            <label style={styles.labelCampo}>
              Dirección
              <input
                value={formProveedor.direccion}
                onChange={(e) => setFormProveedor({ ...formProveedor, direccion: e.target.value })}
                style={styles.inputCampo}
              />
            </label>

            <label style={styles.labelCampo}>
              Ciudad / Departamento
              <input
                value={formProveedor.ciudad}
                onChange={(e) => setFormProveedor({ ...formProveedor, ciudad: e.target.value })}
                style={styles.inputCampo}
              />
            </label>

            {errorProveedor && <p style={{ color: 'var(--danger)' }}>{errorProveedor}</p>}

            <div style={styles.filaBotones}>
              <button type="button" onClick={cerrarPanelProveedor} style={styles.btnSecundario}>Cancelar</button>
              <button type="button" onClick={crearProveedor} disabled={guardandoProveedor} style={styles.btnPrimario}>
                {guardandoProveedor ? 'Guardando...' : 'Guardar proveedor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

const styles = {
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '24px', marginBottom: '28px' },
  subtitulo: { marginBottom: '10px' },
  filaTop: { display: 'flex', gap: '16px', maxWidth: '500px', marginBottom: '8px' },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '4px' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '4px' },
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
  listaResultados: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 20,
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    marginTop: '2px',
    maxHeight: '220px',
    overflowY: 'auto',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  },
  itemResultado: { padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: '13px' },
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
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    background: '#fff',
    borderRadius: 'var(--radius)',
    padding: '24px',
    width: '480px',
    maxWidth: '92vw',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
  },
  panelLateral: {
    position: 'fixed',
    top: 0,
    right: 0,
    height: '100vh',
    width: '420px',
    maxWidth: '92vw',
    background: '#fff',
    padding: '24px',
    overflowY: 'auto',
    boxShadow: '-8px 0 24px rgba(0,0,0,0.15)',
  },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  btnCerrarPanel: { border: 'none', background: 'none', fontSize: '22px', cursor: 'pointer', color: 'var(--text-secondary)', lineHeight: 1 },
};
