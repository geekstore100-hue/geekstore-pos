'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Shell from '../../components/Shell';

function crearPestana(id, nombre) {
  return {
    id,
    nombre,
    carrito: [],
    editandoId: null,
    medioPago: '',
    vendedorId: '',
    lista: 'principal',
  };
}

export default function VentasPage() {
  const [productos, setProductos] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Ventas en paralelo: cada "pestaña" es una venta independiente en curso
  // (su propio carrito, medio de pago, vendedor y lista de precios), para
  // poder dejar una venta pendiente y atender otra sin perder la primera.
  const idContador = useRef(2);
  const [pestanas, setPestanas] = useState(() => [crearPestana(1, 'Venta principal')]);
  const [pestanaActivaId, setPestanaActivaId] = useState(1);
  const activa = pestanas.find((p) => p.id === pestanaActivaId) || pestanas[0];

  const [turno, setTurno] = useState(null);
  const [cargandoTurno, setCargandoTurno] = useState(true);
  const [mostrarAbrirTurno, setMostrarAbrirTurno] = useState(false);
  const [baseInicial, setBaseInicial] = useState('');
  const [guardandoTurno, setGuardandoTurno] = useState(false);
  const [errorTurno, setErrorTurno] = useState('');
  const [mostrarCerrarTurno, setMostrarCerrarTurno] = useState(false);
  const [resumenTurno, setResumenTurno] = useState(null);
  const [cargandoResumen, setCargandoResumen] = useState(false);
  const [dineroReal, setDineroReal] = useState('');
  const [observacionesCierre, setObservacionesCierre] = useState('');
  const [cerrandoTurno, setCerrandoTurno] = useState(false);

  async function cargarTodo() {
    const [rProd, rVend] = await Promise.all([fetch('/api/productos'), fetch('/api/vendedores')]);
    const dProd = await rProd.json();
    const dVend = await rVend.json();
    if (dProd.ok) setProductos(dProd.productos.filter((p) => p.activo));
    if (dVend.ok) setVendedores(dVend.vendedores.filter((v) => v.activo));
  }

  async function cargarTurno() {
    setCargandoTurno(true);
    const res = await fetch('/api/turnos');
    const data = await res.json();
    if (data.ok) setTurno(data.turno);
    setCargandoTurno(false);
  }

  useEffect(() => {
    cargarTodo();
    cargarTurno();
  }, []);

  async function abrirTurno() {
    setErrorTurno('');
    setGuardandoTurno(true);
    const res = await fetch('/api/turnos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_inicial: baseInicial }),
    });
    const data = await res.json();
    setGuardandoTurno(false);
    if (data.ok) {
      setTurno(data.turno);
      setMostrarAbrirTurno(false);
      setBaseInicial('');
    } else {
      setErrorTurno(data.error || 'No se pudo abrir el turno');
    }
  }

  async function abrirModalCerrarTurno() {
    if (!turno) return;
    setErrorTurno('');
    setMostrarCerrarTurno(true);
    setCargandoResumen(true);
    setDineroReal('');
    setObservacionesCierre('');
    const res = await fetch(`/api/turnos/${turno.id}`);
    const data = await res.json();
    if (data.ok) {
      setResumenTurno(data.resumen);
      // Se deja precargado el dinero esperado: si al contar la caja coincide,
      // el usuario no tiene que escribir nada más; si no coincide, lo ajusta.
      setDineroReal(String(data.resumen.dineroEsperado));
    }
    setCargandoResumen(false);
  }

  async function confirmarCierreTurno() {
    if (dineroReal === '') {
      setErrorTurno('Ingresa el dinero real en caja.');
      return;
    }
    setErrorTurno('');
    setCerrandoTurno(true);
    const res = await fetch(`/api/turnos/${turno.id}/cerrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dinero_real_caja: dineroReal, observaciones: observacionesCierre }),
    });
    const data = await res.json();
    setCerrandoTurno(false);
    if (data.ok) {
      setMostrarCerrarTurno(false);
      setResumenTurno(null);
      setTurno(null);
    } else {
      setErrorTurno(data.error || 'No se pudo cerrar el turno');
    }
  }

  function actualizarPestana(id, cambios) {
    setPestanas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...(typeof cambios === 'function' ? cambios(p) : cambios) } : p))
    );
  }

  function agregarPestana() {
    const id = idContador.current++;
    setPestanas((prev) => [...prev, crearPestana(id, `Venta ${prev.length + 1}`)]);
    setPestanaActivaId(id);
    setError('');
    setMensaje('');
  }

  function cerrarPestana(id) {
    if (pestanas.length <= 1) return;
    const restante = pestanas.filter((p) => p.id !== id);
    setPestanas(restante);
    if (id === pestanaActivaId) {
      setPestanaActivaId(restante[restante.length - 1].id);
    }
  }

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter((p) => p.referencia.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q));
  }, [busqueda, productos]);

  function stockPrincipalDe(producto_id) {
    const p = productos.find((x) => x.id === producto_id);
    return p ? Number(p.stock_principal) || 0 : 0;
  }

  function precioSegunLista(producto, listaElegida) {
    if (listaElegida === 'distribuidor') {
      const precioDistribuidor = Number(producto.precio_distribuidor);
      if (precioDistribuidor > 0) return precioDistribuidor;
    }
    return Number(producto.precio_venta) || 0;
  }

  function cambiarLista(nuevaLista) {
    actualizarPestana(activa.id, (p) => ({
      ...p,
      lista: nuevaLista,
      carrito: p.carrito.map((item) => {
        const producto = productos.find((x) => x.id === item.producto_id);
        if (!producto) return item;
        return { ...item, precio_unitario: precioSegunLista(producto, nuevaLista) };
      }),
    }));
  }

  function agregarAlCarrito(producto) {
    if (!turno) {
      setError('Debes abrir un turno para vender.');
      return;
    }
    const inventariable = producto.es_inventariable !== false;
    const disponible = Number(producto.stock_principal) || 0;
    if (inventariable && disponible <= 0) {
      setError('No hay existencias en la bodega Principal para este producto.');
      return;
    }
    setError('');
    actualizarPestana(activa.id, (p) => {
      const existente = p.carrito.find((i) => i.producto_id === producto.id);
      if (existente) {
        if (inventariable && existente.cantidad + 1 > disponible) return p;
        return {
          ...p,
          carrito: p.carrito.map((i) => (i.producto_id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i)),
        };
      }
      return {
        ...p,
        carrito: [
          ...p.carrito,
          {
            producto_id: producto.id,
            referencia: producto.referencia,
            nombre: producto.nombre,
            cantidad: 1,
            precio_unitario: precioSegunLista(producto, p.lista),
            descuento_porcentaje: 0,
          },
        ],
      };
    });
  }

  function cambiarCantidad(producto_id, delta) {
    const producto = productos.find((p) => p.id === producto_id);
    const inventariable = producto ? producto.es_inventariable !== false : true;
    const disponible = inventariable ? stockPrincipalDe(producto_id) : Infinity;
    actualizarPestana(activa.id, (p) => ({
      ...p,
      carrito: p.carrito
        .map((i) => (i.producto_id === producto_id ? { ...i, cantidad: Math.min(i.cantidad + delta, disponible) } : i))
        .filter((i) => i.cantidad > 0),
    }));
  }

  function quitarDelCarrito(producto_id) {
    actualizarPestana(activa.id, (p) => ({
      ...p,
      carrito: p.carrito.filter((i) => i.producto_id !== producto_id),
      editandoId: p.editandoId === producto_id ? null : p.editandoId,
    }));
  }

  function alternarEdicion(producto_id) {
    actualizarPestana(activa.id, (p) => ({ ...p, editandoId: p.editandoId === producto_id ? null : producto_id }));
  }

  function actualizarItem(producto_id, campo, valor) {
    actualizarPestana(activa.id, (p) => ({
      ...p,
      carrito: p.carrito.map((i) => (i.producto_id === producto_id ? { ...i, [campo]: valor } : i)),
    }));
  }

  function subtotalItem(item) {
    const descuento = Number(item.descuento_porcentaje) || 0;
    return item.cantidad * Number(item.precio_unitario) * (1 - descuento / 100);
  }

  const total = activa.carrito.reduce((acc, i) => acc + subtotalItem(i), 0);

  function moneda(n) {
    return `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
  }

  function imprimirTicket(ventana, { ventaId, items, totalVenta, medioPagoUsado, vendedorNombre, listaUsada }) {
    if (!ventana) return;

    const fecha = new Date().toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const filasHtml = items
      .map((i) => {
        const desc = Number(i.descuento_porcentaje) || 0;
        const sub = i.cantidad * Number(i.precio_unitario) * (1 - desc / 100);
        return `
          <tr><td colspan="2" style="padding-top:4px;">${escaparHtml(i.nombre)}</td></tr>
          <tr>
            <td>${i.cantidad} x ${moneda(i.precio_unitario)}${desc ? ` (-${desc}%)` : ''}</td>
            <td style="text-align:right;">${moneda(sub)}</td>
          </tr>`;
      })
      .join('');

    const html = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Ticket ${ventaId}</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          * { box-sizing: border-box; }
          body { width: 80mm; margin: 0; padding: 8px; font-family: 'Courier New', monospace; font-size: 12px; color: #000; }
          h1 { font-size: 16px; text-align: center; margin: 0 0 2px; }
          p { margin: 2px 0; }
          .centro { text-align: center; }
          table { width: 100%; border-collapse: collapse; }
          hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
          .total-fila td { font-size: 14px; font-weight: bold; padding-top: 4px; }
        </style>
      </head>
      <body>
        <h1>GEEK STORE</h1>
        <p class="centro">Venta #${ventaId}</p>
        <p class="centro">${fecha}</p>
        <hr />
        <table>${filasHtml}</table>
        <hr />
        <table>
          <tr class="total-fila"><td>TOTAL</td><td style="text-align:right;">${moneda(totalVenta)}</td></tr>
        </table>
        <hr />
        <p>Medio de pago: ${escaparHtml(medioPagoUsado)}</p>
        ${vendedorNombre ? `<p>Vendedor: ${escaparHtml(vendedorNombre)}</p>` : ''}
        <p>Lista de precios: ${listaUsada === 'distribuidor' ? 'Distribuidor' : 'Principal'}</p>
        <hr />
        <p class="centro">¡Gracias por su compra!</p>
        <script>window.onload = function () { window.focus(); window.print(); };</script>
      </body>
      </html>`;

    ventana.document.open();
    ventana.document.write(html);
    ventana.document.close();
  }

  function escaparHtml(texto) {
    return String(texto || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function confirmarVenta() {
    setError('');
    setMensaje('');

    if (!turno) {
      setError('Debes abrir un turno para vender.');
      return;
    }
    const pestanaVenta = activa;
    if (pestanaVenta.carrito.length === 0) {
      setError('Agrega al menos un producto');
      return;
    }
    if (!pestanaVenta.medioPago) {
      setError('Selecciona el medio de pago');
      return;
    }

    // La ventana se abre ANTES del fetch (mientras aún estamos "dentro" del
    // clic del usuario) para que el navegador no la bloquee como pop-up.
    const ventanaTicket = window.open('', '_blank', 'width=380,height=600');

    setGuardando(true);
    const itemsVendidos = pestanaVenta.carrito;
    const totalVendido = total;
    const vendedorNombre = vendedores.find((v) => String(v.id) === String(pestanaVenta.vendedorId))?.nombre || '';
    const res = await fetch('/api/ventas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        medio_pago: pestanaVenta.medioPago,
        vendedor_id: pestanaVenta.vendedorId ? Number(pestanaVenta.vendedorId) : null,
        items: pestanaVenta.carrito.map((i) => ({
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
      imprimirTicket(ventanaTicket, {
        ventaId: data.ventaId,
        items: itemsVendidos,
        totalVenta: totalVendido,
        medioPagoUsado: pestanaVenta.medioPago,
        vendedorNombre,
        listaUsada: pestanaVenta.lista,
      });
      setMensaje('Venta registrada.');
      actualizarPestana(pestanaVenta.id, (p) => ({ ...p, carrito: [], editandoId: null, medioPago: '' }));
      cargarTodo();
    } else {
      if (ventanaTicket) ventanaTicket.close();
      setError(data.error || 'No se pudo registrar la venta');
    }
  }

  return (
    <Shell title="Vender">
      <div style={styles.layout}>
        <div style={styles.columnaProductos}>
          <div style={styles.barraSuperior}>
            <div style={styles.bannerTurno}>
              {cargandoTurno ? (
                <span>Cargando turno...</span>
              ) : turno ? (
                <>
                  <span>
                    Turno abierto desde{' '}
                    {new Date(turno.abierto_en).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button onClick={abrirModalCerrarTurno} style={styles.linkTurno}>Cerrar turno</button>
                </>
              ) : (
                <>
                  <span>Turno cerrado</span>
                  <button onClick={() => setMostrarAbrirTurno(true)} style={styles.linkTurno}>Abrir turno</button>
                </>
              )}
            </div>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar productos por referencia o nombre..."
              style={styles.buscador}
            />
          </div>
          <div style={styles.grid}>
            {filtrados.map((p) => {
              const enCarrito = activa.carrito.find((i) => i.producto_id === p.id);
              const inventariable = p.es_inventariable !== false;
              const stockPrincipal = Number(p.stock_principal) || 0;
              const stockDistribuidor = Number(p.stock_distribuidor) || 0;
              const agotado = inventariable && stockPrincipal <= 0;
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
                  {p.imagen_key ? (
                    <img src={`/api/imagenes/${p.imagen_key}`} alt="" style={styles.fotoTarjeta} />
                  ) : (
                    <div style={styles.icono}>📦</div>
                  )}
                  <div style={styles.nombre}>{p.nombre}</div>
                  {inventariable ? (
                    <div style={styles.stockInfo}>
                      <span style={styles.badgeStock}>Principal: {stockPrincipal}</span>
                      <span style={styles.badgeStock}>Distribuidor: {stockDistribuidor}</span>
                    </div>
                  ) : (
                    <div style={styles.stockInfo}>
                      <span style={styles.badgeServicio}>Servicio</span>
                    </div>
                  )}
                  {agotado ? (
                    <div style={styles.agotado}>{stockDistribuidor > 0 ? 'Sin stock en Principal' : 'Agotado'}</div>
                  ) : (
                    <div style={styles.precio}>{moneda(precioSegunLista(p, activa.lista))}</div>
                  )}
                </div>
              );
            })}
            {filtrados.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Sin productos.</p>}
          </div>
        </div>

        <div style={styles.columnaCarrito}>
          <div style={styles.listaPrecios}>
            <button
              type="button"
              onClick={() => cambiarLista('principal')}
              style={{ ...styles.btnLista, ...(activa.lista === 'principal' ? styles.btnListaActivo : {}) }}
            >
              Lista Principal
            </button>
            <button
              type="button"
              onClick={() => cambiarLista('distribuidor')}
              style={{ ...styles.btnLista, ...(activa.lista === 'distribuidor' ? styles.btnListaActivo : {}) }}
            >
              Lista Distribuidor
            </button>
          </div>

          <h3 style={{ marginTop: 0 }}>Factura de venta</h3>

          <div style={styles.listaCarrito}>
            {activa.carrito.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Toca un producto para agregarlo.</p>}
            {activa.carrito.map((item) => (
              <div key={item.producto_id} style={styles.itemCarrito}>
                <div style={styles.itemHeader}>
                  <strong onClick={() => alternarEdicion(item.producto_id)} style={{ cursor: 'pointer' }}>
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

                {activa.editandoId === item.producto_id && (
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
                <select
                  value={activa.medioPago}
                  onChange={(e) => actualizarPestana(activa.id, { medioPago: e.target.value })}
                  style={styles.inputCampo}
                >
                  <option value="">Seleccionar</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Tarjeta">Tarjeta</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Otro">Otro</option>
                </select>
              </label>
              <label style={styles.labelCampo}>
                Vendedor
                <select
                  value={activa.vendedorId}
                  onChange={(e) => actualizarPestana(activa.id, { vendedorId: e.target.value })}
                  style={styles.inputCampo}
                >
                  <option value="">Seleccionar</option>
                  {vendedores.map((v) => (
                    <option key={v.id} value={v.id}>{v.nombre}</option>
                  ))}
                </select>
              </label>
            </div>

            {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
            {mensaje && <p style={{ color: 'var(--teal-dark)' }}>{mensaje}</p>}

            <button onClick={confirmarVenta} disabled={guardando || activa.carrito.length === 0} style={styles.btnVender}>
              <span>{guardando ? 'Registrando...' : 'Vender'}</span>
              <span>{moneda(total)}</span>
            </button>

            <div style={styles.piePagina}>
              <span>{activa.carrito.length} producto(s)</span>
              <button onClick={() => actualizarPestana(activa.id, (p) => ({ ...p, carrito: [] }))} style={styles.btnCancelar}>Cancelar</button>
            </div>
          </div>
        </div>
      </div>

      <div style={styles.pestanasBar}>
        {pestanas.map((p) => (
          <div
            key={p.id}
            style={{ ...styles.pestanaBtn, ...(p.id === activa.id ? styles.pestanaBtnActiva : {}) }}
            onClick={() => setPestanaActivaId(p.id)}
          >
            <span>🛒 {p.nombre}</span>
            {p.carrito.length > 0 && <span style={styles.pestanaBadge}>{p.carrito.length}</span>}
            {pestanas.length > 1 && (
              <span
                style={styles.pestanaCerrar}
                onClick={(e) => {
                  e.stopPropagation();
                  cerrarPestana(p.id);
                }}
              >
                ×
              </span>
            )}
          </div>
        ))}
        <button type="button" onClick={agregarPestana} style={styles.pestanaAgregar} title="Nueva venta">+</button>
      </div>

      {mostrarAbrirTurno && (
        <div style={styles.overlay} onMouseDown={() => setMostrarAbrirTurno(false)}>
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Abrir turno</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
              Indica el dinero en efectivo con el que inicias el turno.
            </p>
            <label style={styles.labelCampo}>
              Base inicial
              <input
                type="number"
                step="0.01"
                value={baseInicial}
                onChange={(e) => setBaseInicial(e.target.value)}
                style={styles.inputCampo}
                autoFocus
              />
            </label>

            {errorTurno && <p style={{ color: 'var(--danger)' }}>{errorTurno}</p>}

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button onClick={abrirTurno} disabled={guardandoTurno} style={styles.btnPrimario}>
                {guardandoTurno ? 'Abriendo...' : 'Guardar'}
              </button>
              <button onClick={() => setMostrarAbrirTurno(false)} style={styles.btnSecundarioModal}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {mostrarCerrarTurno && (
        <div style={styles.overlay} onMouseDown={() => setMostrarCerrarTurno(false)}>
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Cerrar turno</h3>
            {turno && (
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                Fecha de inicio{' '}
                {new Date(turno.abierto_en).toLocaleString('es-CO', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}

            {cargandoResumen ? (
              <p>Cargando resumen...</p>
            ) : (
              resumenTurno && (
                <>
                  <div style={styles.filaResumenTurno}><span>Base inicial</span><strong>{moneda(resumenTurno.baseInicial)}</strong></div>
                  <div style={styles.filaResumenTurno}><span>Ventas en efectivo</span><strong>{moneda(resumenTurno.ventasEfectivo)}</strong></div>
                  <div style={styles.filaResumenTurno}><span>Ventas por tarjeta</span><strong>{moneda(resumenTurno.ventasTarjeta)}</strong></div>
                  <div style={styles.filaResumenTurno}><span>Ventas por transferencia</span><strong>{moneda(resumenTurno.ventasTransferencia)}</strong></div>
                  <div style={styles.filaResumenTurno}><span>Otros medios de pago</span><strong>{moneda(resumenTurno.ventasOtro)}</strong></div>
                  <div style={styles.filaResumenTurno}><span>Devolución de dinero</span><strong>{moneda(resumenTurno.devolucionDinero)}</strong></div>
                  <div style={{ ...styles.filaResumenTurno, borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px', fontWeight: 700 }}>
                    <span>Total de ventas</span><span>{moneda(resumenTurno.totalVentas)}</span>
                  </div>
                  <div style={styles.dineroEsperado}>
                    <span>Dinero esperado en caja</span><strong>{moneda(resumenTurno.dineroEsperado)}</strong>
                  </div>
                </>
              )
            )}

            <label style={{ ...styles.labelCampo, marginTop: '16px' }}>
              Dinero real en caja *
              <input
                type="number"
                step="0.01"
                value={dineroReal}
                onChange={(e) => setDineroReal(e.target.value)}
                style={styles.inputCampo}
              />
            </label>
            {resumenTurno && dineroReal !== '' && (
              (() => {
                const diferencia = Number(dineroReal) - resumenTurno.dineroEsperado;
                const coincide = Math.abs(diferencia) < 1;
                return (
                  <p style={{ fontSize: '13px', color: coincide ? 'var(--teal-dark)' : 'var(--danger)', margin: '0 0 8px' }}>
                    {coincide ? 'Coincide con el dinero esperado.' : `Diferencia: ${diferencia > 0 ? '+' : ''}${moneda(diferencia)}`}
                  </p>
                );
              })()
            )}
            <label style={styles.labelCampo}>
              Observaciones
              <textarea
                value={observacionesCierre}
                onChange={(e) => setObservacionesCierre(e.target.value)}
                style={{ ...styles.inputCampo, minHeight: '50px' }}
              />
            </label>

            {errorTurno && <p style={{ color: 'var(--danger)' }}>{errorTurno}</p>}

            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button onClick={confirmarCierreTurno} disabled={cerrandoTurno} style={styles.btnPrimario}>
                {cerrandoTurno ? 'Cerrando...' : 'Guardar'}
              </button>
              <button onClick={() => setMostrarCerrarTurno(false)} style={styles.btnSecundarioModal}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

const styles = {
  layout: { display: 'flex', gap: '20px', alignItems: 'flex-start', paddingBottom: '56px' },
  columnaProductos: { flex: 1, minWidth: 0 },
  barraSuperior: {
    position: 'sticky',
    top: 0,
    zIndex: 5,
    background: 'var(--bg)',
    paddingBottom: '10px',
  },
  bannerTurno: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginBottom: '6px',
  },
  linkTurno: {
    border: 'none',
    background: 'none',
    color: 'var(--teal-dark)',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '12px',
    padding: 0,
  },
  buscador: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    boxSizing: 'border-box',
    background: '#fff',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '14px',
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
  icono: {
    width: '150px',
    height: '150px',
    margin: '8px auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '52px',
    background: 'var(--bg)',
    borderRadius: '10px',
  },
  fotoTarjeta: { width: '150px', height: '150px', objectFit: 'contain', background: 'var(--bg)', borderRadius: '10px', margin: '8px auto', display: 'block' },
  nombre: { fontSize: '13px', fontWeight: 600, marginBottom: '4px', minHeight: '32px' },
  stockInfo: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', marginBottom: '6px' },
  badgeStock: {
    fontSize: '11px',
    color: 'var(--teal-dark)',
    background: 'var(--teal-light)',
    borderRadius: '999px',
    padding: '1px 9px',
    display: 'inline-block',
  },
  badgeServicio: {
    fontSize: '11px',
    color: '#6b7280',
    background: '#f3f4f6',
    borderRadius: '999px',
    padding: '1px 9px',
    display: 'inline-block',
  },
  precio: { fontSize: '17px', fontWeight: 700, color: 'var(--text)' },
  listaPrecios: { display: 'flex', gap: '8px', marginBottom: '12px' },
  btnLista: {
    flex: 1,
    padding: '8px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  btnListaActivo: { background: 'var(--teal)', color: '#fff', border: '1px solid var(--teal)' },
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
  pestanasBar: {
    position: 'fixed',
    bottom: '14px',
    left: '80px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    zIndex: 60,
    flexWrap: 'wrap',
    maxWidth: 'calc(100vw - 380px)',
  },
  pestanaBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    borderRadius: '999px',
    background: '#fff',
    border: '1px solid var(--border)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    fontSize: '13px',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
  },
  pestanaBtnActiva: {
    background: 'var(--teal)',
    color: '#fff',
    border: '1px solid var(--teal)',
    fontWeight: 600,
  },
  pestanaBadge: {
    background: 'rgba(0,0,0,0.15)',
    borderRadius: '999px',
    padding: '0 7px',
    fontSize: '11px',
  },
  pestanaCerrar: {
    marginLeft: '2px',
    cursor: 'pointer',
    fontSize: '14px',
    lineHeight: 1,
  },
  pestanaAgregar: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    border: 'none',
    background: 'var(--teal)',
    color: '#fff',
    fontSize: '18px',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    background: '#fff',
    borderRadius: 'var(--radius)',
    padding: '24px',
    width: '380px',
    maxWidth: '92vw',
    maxHeight: '88vh',
    overflowY: 'auto',
    boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
  },
  btnSecundarioModal: {
    padding: '9px 16px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: '#fff',
    cursor: 'pointer',
  },
  btnPrimario: {
    padding: '9px 16px',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--teal)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
  },
  filaResumenTurno: { display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '13px' },
  dineroEsperado: {
    display: 'flex',
    justifyContent: 'space-between',
    background: 'var(--bg)',
    padding: '10px 12px',
    borderRadius: '8px',
    marginTop: '10px',
    fontSize: '14px',
  },
};
