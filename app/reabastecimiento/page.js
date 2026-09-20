'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '../../components/Shell';

export default function ReabastecimientoPage() {
  const [alertas, setAlertas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [bodegas, setBodegas] = useState([]);
  const [traspasos, setTraspasos] = useState([]);
  const [cargandoTraspasos, setCargandoTraspasos] = useState(true);

  const [bodegaOrigenId, setBodegaOrigenId] = useState('');
  const [bodegaDestinoId, setBodegaDestinoId] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const [carrito, setCarrito] = useState([]); // [{producto_id, referencia, nombre, imagen_key, cantidad, precio_costo, disponible}]

  const [productosTodos, setProductosTodos] = useState([]);
  const [buscarTexto, setBuscarTexto] = useState('');

  const [creando, setCreando] = useState(false);
  const [errorCarrito, setErrorCarrito] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [pagandoId, setPagandoId] = useState(null);

  const bodegaPrincipal = useMemo(() => bodegas.find((b) => b.nombre === 'Principal'), [bodegas]);
  const bodegaDistribuidor = useMemo(() => bodegas.find((b) => b.nombre === 'Bodega Distribuidor'), [bodegas]);

  async function cargarAlertas() {
    setCargando(true);
    setError('');
    const res = await fetch('/api/reabastecimiento');
    const data = await res.json();
    if (data.ok) setAlertas(data.alertas);
    else setError(data.error || 'No se pudo cargar el análisis');
    setCargando(false);
  }

  async function cargarBodegas() {
    const res = await fetch('/api/bodegas');
    const data = await res.json();
    if (data.ok) setBodegas(data.bodegas);
  }

  async function cargarTraspasos() {
    setCargandoTraspasos(true);
    const res = await fetch('/api/traspasos');
    const data = await res.json();
    if (data.ok) setTraspasos(data.traspasos);
    setCargandoTraspasos(false);
  }

  async function cargarProductos() {
    const res = await fetch('/api/productos');
    const data = await res.json();
    if (data.ok) setProductosTodos(data.productos || []);
  }

  useEffect(() => {
    cargarAlertas();
    cargarBodegas();
    cargarTraspasos();
    cargarProductos();
  }, []);

  // Por defecto el traspaso va de Bodega Distribuidor a Principal, que es el
  // caso de uso normal de esta pantalla. Se puede cambiar si hace falta.
  useEffect(() => {
    if (bodegaDistribuidor && !bodegaOrigenId) setBodegaOrigenId(String(bodegaDistribuidor.id));
    if (bodegaPrincipal && !bodegaDestinoId) setBodegaDestinoId(String(bodegaPrincipal.id));
  }, [bodegaDistribuidor, bodegaPrincipal]); // eslint-disable-line react-hooks/exhaustive-deps

  function agregarAlCarrito(producto) {
    setMensaje('');
    setErrorCarrito('');
    setCarrito((actual) => {
      const yaEsta = actual.find((it) => it.producto_id === producto.id);
      if (yaEsta) {
        return actual.map((it) =>
          it.producto_id === producto.id ? { ...it, cantidad: it.cantidad + (producto.cantidadInicial || 1) } : it
        );
      }
      return [
        ...actual,
        {
          producto_id: producto.id,
          referencia: producto.referencia,
          nombre: producto.nombre,
          imagen_key: producto.imagen_key,
          precio_costo: Number(producto.precio_costo) || 0,
          cantidad: producto.cantidadInicial || 1,
        },
      ];
    });
  }

  function actualizarCantidad(productoId, cantidad) {
    setCarrito((actual) =>
      actual.map((it) => (it.producto_id === productoId ? { ...it, cantidad: Number(cantidad) || 0 } : it))
    );
  }

  function quitarDelCarrito(productoId) {
    setCarrito((actual) => actual.filter((it) => it.producto_id !== productoId));
  }

  const valorCarrito = useMemo(
    () => carrito.reduce((total, it) => total + it.precio_costo * (Number(it.cantidad) || 0), 0),
    [carrito]
  );

  async function crearTraspaso() {
    setErrorCarrito('');
    setMensaje('');

    if (!bodegaOrigenId || !bodegaDestinoId) {
      setErrorCarrito('Selecciona la bodega de origen y destino');
      return;
    }
    if (bodegaOrigenId === bodegaDestinoId) {
      setErrorCarrito('La bodega de origen y destino no pueden ser la misma');
      return;
    }
    if (carrito.length === 0) {
      setErrorCarrito('Agrega al menos un producto al traspaso');
      return;
    }
    const invalido = carrito.find((it) => !it.cantidad || it.cantidad <= 0);
    if (invalido) {
      setErrorCarrito(`Revisa la cantidad de "${invalido.nombre}"`);
      return;
    }

    // La ventana se abre ANTES del await para que el navegador no la
    // bloquee como popup (solo funciona si se abre de forma síncrona
    // dentro del clic).
    const ventanaImpresion = window.open('', '_blank');

    setCreando(true);
    const res = await fetch('/api/traspasos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bodega_origen_id: Number(bodegaOrigenId),
        bodega_destino_id: Number(bodegaDestinoId),
        observaciones: observaciones || null,
        items: carrito.map((it) => ({ producto_id: it.producto_id, cantidad: Number(it.cantidad) })),
      }),
    });
    const data = await res.json();
    setCreando(false);

    if (data.ok) {
      if (ventanaImpresion) {
        ventanaImpresion.location = `/traspasos/${data.traspasoId}/imprimir`;
      }
      setMensaje('Traspaso creado. Se abrió el documento para imprimir y entregar al vendedor.');
      setCarrito([]);
      setObservaciones('');
      cargarAlertas();
      cargarTraspasos();
    } else {
      if (ventanaImpresion) ventanaImpresion.close();
      setErrorCarrito(data.error || 'No se pudo crear el traspaso');
    }
  }

  async function marcarPagado(traspasoId) {
    setPagandoId(traspasoId);
    const res = await fetch(`/api/traspasos/${traspasoId}/pagar`, { method: 'POST' });
    const data = await res.json();
    setPagandoId(null);
    if (data.ok) cargarTraspasos();
  }

  function moneda0(n) {
    return Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
  }

  function fechaHora(iso) {
    return new Date(iso).toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const agotados = alertas.filter((a) => a.prioridad === 1);
  const porAgotarse = alertas.filter((a) => a.prioridad === 2);

  const deudaConDistribuidor = useMemo(
    () =>
      traspasos
        .filter((t) => t.estado_pago === 'pendiente' && t.bodega_origen_nombre === 'Bodega Distribuidor')
        .reduce((total, t) => total + Number(t.valor_total || 0), 0),
    [traspasos]
  );

  const resultadosBusqueda = useMemo(() => {
    const texto = buscarTexto.trim().toLowerCase();
    if (!texto) return [];
    return productosTodos
      .filter((p) => p.activo !== false && p.es_inventariable !== false)
      .filter(
        (p) =>
          (p.nombre || '').toLowerCase().includes(texto) || (p.referencia || '').toLowerCase().includes(texto)
      )
      .slice(0, 8);
  }, [buscarTexto, productosTodos]);

  function renderFilaAlerta(item) {
    const enCarrito = carrito.find((it) => it.producto_id === item.id);
    return (
      <div key={item.id} style={styles.fila}>
        <div style={styles.filaInfo}>
          {item.imagen_key ? (
            <img src={`/api/imagenes/${item.imagen_key}`} alt="" style={styles.miniatura} />
          ) : (
            <div style={styles.miniaturaVacia} />
          )}
          <div>
            <div style={{ fontWeight: 600 }}>{item.nombre}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{item.referencia}</div>
          </div>
        </div>

        <div style={styles.filaStock}>
          <span style={styles.badgeStock}>Principal: {moneda0(item.stock_principal)}</span>
          <span style={styles.badgeStock}>Distribuidor: {moneda0(item.stock_distribuidor)}</span>
        </div>

        <div style={styles.filaVelocidad}>
          {item.venta_diaria_promedio > 0 ? (
            <>
              <div>{item.venta_diaria_promedio.toFixed(2)} u/día (30 días)</div>
              {item.dias_cobertura !== null && (
                <div style={{ color: 'var(--text-secondary)' }}>~{Math.floor(item.dias_cobertura)} día(s) de cobertura</div>
              )}
            </>
          ) : (
            <span style={{ color: 'var(--text-secondary)' }}>Sin ventas recientes</span>
          )}
        </div>

        <div style={styles.filaAccion}>
          {item.accion === 'trasladar' ? (
            enCarrito ? (
              <span style={styles.badgeEnCarrito}>En el traspaso ({enCarrito.cantidad})</span>
            ) : (
              <button
                onClick={() => agregarAlCarrito({ ...item, cantidadInicial: item.cantidad_sugerida || 1 })}
                style={styles.btnPrimario}
              >
                Agregar {item.cantidad_sugerida} {item.estimado ? '(estimado)' : ''}
              </button>
            )
          ) : (
            <span style={styles.badgeComprar}>Comprar más (sin stock en Distribuidor)</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <Shell title="Reabastecimiento">
      <p style={{ color: 'var(--text-secondary)', marginTop: '-8px' }}>
        Productos agotados en Principal, y productos que según su ritmo de venta se van a agotar pronto. Se calcula
        con las ventas de los últimos 30 días.
      </p>

      {deudaConDistribuidor > 0 && (
        <div style={styles.tarjetaDeuda}>
          Debes a Bodega Distribuidor: <strong>${moneda0(deudaConDistribuidor)}</strong> por traspasos pendientes de pago
        </div>
      )}

      {cargando ? (
        <p>Cargando...</p>
      ) : error ? (
        <p style={{ color: 'var(--danger)' }}>{error}</p>
      ) : (
        <>
          <h3 style={{ marginTop: '20px' }}>Agotados en Principal ({agotados.length})</h3>
          <div style={styles.tableCard}>
            {agotados.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>No hay productos agotados en Principal. 🎉</p>}
            {agotados.map(renderFilaAlerta)}
          </div>

          <h3 style={{ marginTop: '28px' }}>Por agotarse pronto ({porAgotarse.length})</h3>
          <div style={styles.tableCard}>
            {porAgotarse.length === 0 && (
              <p style={{ color: 'var(--text-secondary)' }}>Ningún producto está por agotarse según su ritmo de venta.</p>
            )}
            {porAgotarse.map(renderFilaAlerta)}
          </div>
        </>
      )}

      <h3 style={{ marginTop: '28px' }}>Traspaso en curso</h3>
      <div style={styles.tableCard}>
        <div style={styles.filaBodegas}>
          <div>
            <label style={styles.etiquetaChica}>De</label>
            <select value={bodegaOrigenId} onChange={(e) => setBodegaOrigenId(e.target.value)} style={styles.select}>
              <option value="">Selecciona...</option>
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>{b.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={styles.etiquetaChica}>A</label>
            <select value={bodegaDestinoId} onChange={(e) => setBodegaDestinoId(e.target.value)} style={styles.select}>
              <option value="">Selecciona...</option>
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>{b.nombre}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <label style={styles.etiquetaChica}>Observaciones (opcional)</label>
            <input
              type="text"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Ej: reposición semanal"
              style={{ ...styles.select, width: '100%' }}
            />
          </div>
        </div>

        <div style={{ position: 'relative', marginTop: '14px' }}>
          <label style={styles.etiquetaChica}>Agregar otro producto</label>
          <input
            type="text"
            value={buscarTexto}
            onChange={(e) => setBuscarTexto(e.target.value)}
            placeholder="Buscar por nombre o referencia..."
            style={{ ...styles.select, width: '100%' }}
          />
          {resultadosBusqueda.length > 0 && (
            <div style={styles.dropdownBusqueda}>
              {resultadosBusqueda.map((p) => (
                <div
                  key={p.id}
                  style={styles.opcionBusqueda}
                  onClick={() => {
                    agregarAlCarrito({ ...p, cantidadInicial: 1 });
                    setBuscarTexto('');
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px', marginLeft: '8px' }}>{p.referencia}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {carrito.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', marginTop: '14px' }}>
            Todavía no has agregado productos a este traspaso.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '14px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={styles.th}>Producto</th>
                <th style={styles.th}>Cantidad</th>
                <th style={styles.th}>Costo unitario</th>
                <th style={styles.th}>Subtotal</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {carrito.map((it) => (
                <tr key={it.producto_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 600 }}>{it.nombre}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{it.referencia}</div>
                  </td>
                  <td style={styles.td}>
                    <input
                      type="number"
                      min="1"
                      value={it.cantidad}
                      onChange={(e) => actualizarCantidad(it.producto_id, e.target.value)}
                      style={styles.inputCantidad}
                    />
                  </td>
                  <td style={styles.td}>${moneda0(it.precio_costo)}</td>
                  <td style={styles.td}>${moneda0(it.precio_costo * it.cantidad)}</td>
                  <td style={styles.td}>
                    <button onClick={() => quitarDelCarrito(it.producto_id)} style={styles.btnQuitar}>Quitar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {carrito.length > 0 && (
          <div style={styles.resumenCarrito}>
            <div>Valor total del traspaso: <strong>${moneda0(valorCarrito)}</strong></div>
            <button onClick={crearTraspaso} disabled={creando} style={styles.btnPrimario}>
              {creando ? 'Creando...' : 'Crear traspaso e imprimir'}
            </button>
          </div>
        )}

        {mensaje && <p style={{ color: 'var(--teal-dark)', marginTop: '10px' }}>{mensaje}</p>}
        {errorCarrito && <p style={{ color: 'var(--danger)', marginTop: '10px' }}>{errorCarrito}</p>}
      </div>

      <h3 style={{ marginTop: '28px' }}>Traspasos recientes</h3>
      <div style={styles.tableCard}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={styles.th}>Fecha</th>
              <th style={styles.th}>De</th>
              <th style={styles.th}>A</th>
              <th style={styles.th}>Productos</th>
              <th style={styles.th}>Valor</th>
              <th style={styles.th}>Pago</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {traspasos.map((t) => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={styles.td}>{fechaHora(t.creado_en)}</td>
                <td style={styles.td}>{t.bodega_origen_nombre}</td>
                <td style={styles.td}>{t.bodega_destino_nombre}</td>
                <td style={styles.td}>{t.items} producto(s) · {moneda0(t.unidades)} u.</td>
                <td style={styles.td}>${moneda0(t.valor_total)}</td>
                <td style={styles.td}>
                  {t.estado_pago === 'pagado' ? (
                    <span style={styles.badgePagado}>Pagado</span>
                  ) : (
                    <button onClick={() => marcarPagado(t.id)} disabled={pagandoId === t.id} style={styles.btnSecundario}>
                      {pagandoId === t.id ? 'Marcando...' : 'Marcar como pagado'}
                    </button>
                  )}
                </td>
                <td style={styles.td}>
                  <a href={`/traspasos/${t.id}/imprimir`} target="_blank" rel="noreferrer" style={styles.linkVer}>
                    Ver / imprimir
                  </a>
                </td>
              </tr>
            ))}
            {traspasos.length === 0 && !cargandoTraspasos && (
              <tr><td style={styles.td} colSpan={7}>Todavía no se ha hecho ningún traspaso.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

const styles = {
  tableCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 16px', marginBottom: '8px' },
  tarjetaDeuda: {
    background: 'var(--warning-light, #fff4e5)',
    color: 'var(--warning-dark, #8a5a00)',
    border: '1px solid var(--warning, #f0b429)',
    borderRadius: 'var(--radius)',
    padding: '10px 16px',
    marginTop: '14px',
    fontSize: '14px',
  },
  fila: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '14px 4px',
    borderBottom: '1px solid var(--border)',
    flexWrap: 'wrap',
  },
  filaInfo: { display: 'flex', alignItems: 'center', gap: '10px', minWidth: '220px', flex: 1 },
  miniatura: { width: '44px', height: '44px', objectFit: 'contain', background: 'var(--bg)', borderRadius: '8px' },
  miniaturaVacia: { width: '44px', height: '44px', borderRadius: '8px', background: 'var(--bg)' },
  filaStock: { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '140px' },
  badgeStock: {
    fontSize: '11px',
    color: 'var(--teal-dark)',
    background: 'var(--teal-light)',
    borderRadius: '999px',
    padding: '1px 9px',
    display: 'inline-block',
    width: 'fit-content',
  },
  filaVelocidad: { fontSize: '13px', minWidth: '160px' },
  filaAccion: { minWidth: '180px' },
  badgeEnCarrito: { fontSize: '12px', color: 'var(--teal-dark)', fontWeight: 600 },
  btnPrimario: { padding: '9px 14px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '13px' },
  btnSecundario: { padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '12px' },
  btnQuitar: { padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '12px', color: 'var(--danger)' },
  badgeComprar: { fontSize: '12px', color: 'var(--warning)', fontWeight: 600 },
  badgePagado: { fontSize: '12px', color: 'var(--teal-dark)', background: 'var(--teal-light)', borderRadius: '999px', padding: '3px 10px' },
  th: { padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)' },
  td: { padding: '10px 8px', fontSize: '14px' },
  filaBodegas: { display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' },
  etiquetaChica: { display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' },
  select: { padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px' },
  inputCantidad: { width: '70px', padding: '7px', borderRadius: '6px', border: '1px solid var(--border)' },
  dropdownBusqueda: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    marginTop: '4px',
    zIndex: 5,
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  },
  opcionBusqueda: { padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)' },
  resumenCarrito: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '14px',
    paddingTop: '14px',
    borderTop: '1px solid var(--border)',
  },
  linkVer: { color: 'var(--teal-dark)', fontSize: '13px', textDecoration: 'none', fontWeight: 600 },
};
