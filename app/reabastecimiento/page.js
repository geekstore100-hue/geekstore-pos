'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '../../components/Shell';

export default function ReabastecimientoPage() {
  const router = useRouter();
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

  // Cuánto hay ahora mismo de cada producto en la bodega de origen elegida,
  // para saber cuántas unidades como máximo se pueden mover (sin esto no
  // hay forma de saberlo al escribir la cantidad).
  const [stockOrigenPorProducto, setStockOrigenPorProducto] = useState({});

  const [errorCarrito, setErrorCarrito] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [pagandoId, setPagandoId] = useState(null);

  // Para el botón "Etiquetas Excel" de cada traspaso ya guardado.
  const [generandoEtiquetasId, setGenerandoEtiquetasId] = useState(null);
  const [errorEtiquetas, setErrorEtiquetas] = useState('');

  // Controla el panel flotante del traspaso, para no tener que bajar hasta el
  // final de la página cada vez que se agrega o se revisa un producto.
  const [carritoAbierto, setCarritoAbierto] = useState(false);

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

  async function cargarStockOrigen(bId) {
    if (!bId) {
      setStockOrigenPorProducto({});
      return;
    }
    const res = await fetch(`/api/stock?bodega_id=${bId}`);
    const data = await res.json();
    if (data.ok) {
      const mapa = {};
      data.stock.forEach((s) => {
        mapa[s.producto_id] = Number(s.cantidad);
      });
      setStockOrigenPorProducto(mapa);
    }
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

  useEffect(() => {
    cargarStockOrigen(bodegaOrigenId);
  }, [bodegaOrigenId]);

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

  // No crea el traspaso todavía: lleva los productos y cantidades a la
  // pantalla de Ajustes de Inventario para que ahí se terminen de verificar
  // (comparando con lo que ya hay en la bodega destino) y se guarde e
  // imprima desde allá.
  function confirmarYContinuar() {
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

    const bodegaOrigenNombre = bodegas.find((b) => String(b.id) === String(bodegaOrigenId))?.nombre || '';

    try {
      sessionStorage.setItem(
        'geekstore_traspaso_pendiente',
        JSON.stringify({
          bodega_origen_id: Number(bodegaOrigenId),
          bodega_origen_nombre: bodegaOrigenNombre,
          bodega_destino_id: Number(bodegaDestinoId),
          observaciones: observaciones || '',
          items: carrito.map((it) => ({
            producto_id: it.producto_id,
            referencia: it.referencia,
            nombre: it.nombre,
            cantidad: Number(it.cantidad),
            costo: it.precio_costo,
          })),
        })
      );
    } catch {
      setErrorCarrito('No se pudo preparar el traspaso. Intenta de nuevo.');
      return;
    }

    setCarrito([]);
    router.push('/ajustes-inventario');
  }

  // Al principio del Excel se agregan 3 filas de prueba (ver FILAS_PRUEBA
  // más abajo): la impresora de etiquetas de Nelson daña la primera fila
  // física al imprimir, así que esas 3 se sacrifican en vez de perder
  // etiquetas de productos reales. Mismo criterio que en Entradas.
  const FILAS_PRUEBA = [
    ['PRUEBA', 'Etiqueta de prueba (impresora)', '0'],
    ['PRUEBA', 'Etiqueta de prueba (impresora)', '0'],
    ['PRUEBA', 'Etiqueta de prueba (impresora)', '0'],
  ];

  // Genera un Excel (.xlsx) para importar en OpenLabel e imprimir etiquetas de
  // precio de los productos que llegaron en este traspaso: una fila por cada
  // unidad, con Referencia, Artículo y Precio de venta (formato colombiano
  // con punto de miles). Es lo mismo que hay en Entradas, pero aplicado a lo
  // que llegó por traspaso entre bodegas.
  async function descargarExcelEtiquetasTraspaso(t) {
    setErrorEtiquetas('');
    setGenerandoEtiquetasId(t.id);
    try {
      const res = await fetch(`/api/traspasos/${t.id}`);
      const data = await res.json();
      if (!data.ok) {
        setErrorEtiquetas(data.error || 'No se pudo cargar el traspaso');
        return;
      }

      const filas = [];
      const sinPrecio = new Set();

      data.items.forEach((it) => {
        const producto = productosTodos.find((p) => p.referencia === it.referencia);
        const precio = Number(producto?.precio_venta) || 0;
        if (!producto || !producto.precio_venta) sinPrecio.add(it.referencia);

        const precioFormateado = precio.toLocaleString('es-CO', { maximumFractionDigits: 0 });
        const cantidad = Math.max(1, Number(it.cantidad) || 0);

        for (let i = 0; i < cantidad; i++) {
          filas.push([it.referencia, it.nombre, precioFormateado]);
        }
      });

      if (filas.length === 0) {
        setErrorEtiquetas('Este traspaso no tiene productos');
        return;
      }
      if (sinPrecio.size > 0) {
        setErrorEtiquetas(
          `Ojo: no se encontró precio de venta para: ${Array.from(sinPrecio).join(', ')}. Se generó el Excel igual, con $0 para esos productos.`
        );
      }

      const XLSX = await import('xlsx');
      const hoja = XLSX.utils.aoa_to_sheet([['Referencia', 'Artículo', 'Precio'], ...FILAS_PRUEBA, ...filas]);
      hoja['!cols'] = [{ wch: 16 }, { wch: 36 }, { wch: 12 }];
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, 'Etiquetas');
      XLSX.writeFile(libro, `etiquetas_openlabel_traspaso${t.id}.xlsx`);
    } finally {
      setGenerandoEtiquetasId(null);
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
                <th style={styles.th}>Disponible en origen</th>
                <th style={styles.th}>Cantidad</th>
                <th style={styles.th}>Costo unitario</th>
                <th style={styles.th}>Subtotal</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {carrito.map((it) => {
                const disponible = stockOrigenPorProducto[it.producto_id] ?? 0;
                const excede = Number(it.cantidad) > disponible;
                return (
                  <tr key={it.producto_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={styles.td}>
                      <div style={{ fontWeight: 600 }}>{it.nombre}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{it.referencia}</div>
                    </td>
                    <td style={{ ...styles.td, color: excede ? 'var(--danger)' : 'var(--text-secondary)' }}>
                      {disponible}
                    </td>
                    <td style={styles.td}>
                      <input
                        type="number"
                        min="1"
                        max={disponible || undefined}
                        value={it.cantidad}
                        onChange={(e) => actualizarCantidad(it.producto_id, e.target.value)}
                        style={{ ...styles.inputCantidad, borderColor: excede ? 'var(--danger)' : undefined }}
                      />
                    </td>
                    <td style={styles.td}>${moneda0(it.precio_costo)}</td>
                    <td style={styles.td}>${moneda0(it.precio_costo * it.cantidad)}</td>
                    <td style={styles.td}>
                      <button onClick={() => quitarDelCarrito(it.producto_id)} style={styles.btnQuitar}>Quitar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {carrito.length > 0 && (
          <div style={styles.resumenCarrito}>
            <div>Valor total del traspaso: <strong>${moneda0(valorCarrito)}</strong></div>
            <button onClick={confirmarYContinuar} style={styles.btnPrimario}>
              Confirmar e ir a Ajustes de Inventario
            </button>
          </div>
        )}

        {mensaje && <p style={{ color: 'var(--teal-dark)', marginTop: '10px' }}>{mensaje}</p>}
        {errorCarrito && <p style={{ color: 'var(--danger)', marginTop: '10px' }}>{errorCarrito}</p>}
      </div>

      <h3 style={{ marginTop: '28px' }}>Traspasos recientes</h3>
      {errorEtiquetas && <p style={{ color: 'var(--danger)' }}>{errorEtiquetas}</p>}
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
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <a href={`/traspasos/${t.id}/imprimir`} target="_blank" rel="noreferrer" style={styles.linkVer}>
                      Ver / imprimir
                    </a>
                    {t.estado_pago === 'pendiente' && (
                      <a href={`/traspasos/${t.id}/editar`} style={styles.linkVer}>
                        Editar
                      </a>
                    )}
                    <button
                      onClick={() => descargarExcelEtiquetasTraspaso(t)}
                      disabled={generandoEtiquetasId === t.id}
                      style={styles.linkBoton}
                    >
                      {generandoEtiquetasId === t.id ? 'Generando...' : 'Etiquetas Excel'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {traspasos.length === 0 && !cargandoTraspasos && (
              <tr><td style={styles.td} colSpan={7}>Todavía no se ha hecho ningún traspaso.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {carrito.length > 0 && (
        <div style={styles.flotanteContenedor}>
          {carritoAbierto && (
            <div style={styles.flotantePanel}>
              <div style={styles.flotanteHeader}>
                <strong>Traspaso en curso</strong>
                <button onClick={() => setCarritoAbierto(false)} style={styles.btnCerrarFlotante}>✕</button>
              </div>

              <div style={styles.flotanteItems}>
                {carrito.map((it) => {
                  const disponible = stockOrigenPorProducto[it.producto_id] ?? 0;
                  const excede = Number(it.cantidad) > disponible;
                  return (
                    <div key={it.producto_id} style={styles.flotanteFila}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {it.nombre}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>${moneda0(it.precio_costo)} c/u</div>
                        <div style={{ fontSize: '11px', color: excede ? 'var(--danger)' : 'var(--text-secondary)' }}>
                          Disponible en origen: {disponible}
                        </div>
                      </div>
                      <input
                        type="number"
                        min="1"
                        max={disponible || undefined}
                        value={it.cantidad}
                        onChange={(e) => actualizarCantidad(it.producto_id, e.target.value)}
                        style={{ ...styles.inputCantidadChico, borderColor: excede ? 'var(--danger)' : undefined }}
                      />
                      <button onClick={() => quitarDelCarrito(it.producto_id)} style={styles.btnQuitarChico}>✕</button>
                    </div>
                  );
                })}
              </div>

              <div style={styles.flotanteTotal}>
                Total: <strong>${moneda0(valorCarrito)}</strong>
              </div>

              {errorCarrito && <p style={{ color: 'var(--danger)', fontSize: '12px', margin: '6px 0 0' }}>{errorCarrito}</p>}
              {mensaje && <p style={{ color: 'var(--teal-dark)', fontSize: '12px', margin: '6px 0 0' }}>{mensaje}</p>}

              <button onClick={confirmarYContinuar} style={styles.btnPrimarioAncho}>
                Confirmar e ir a Ajustes de Inventario
              </button>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', margin: '6px 0 0' }}>
                Para cambiar la bodega de origen/destino u observaciones, baja a "Traspaso en curso".
              </p>
            </div>
          )}

          <button onClick={() => setCarritoAbierto((v) => !v)} style={styles.botonFlotante}>
            {carrito.length} producto{carrito.length === 1 ? '' : 's'} · ${moneda0(valorCarrito)}
            {carritoAbierto ? ' ▾' : ' ▴'}
          </button>
        </div>
      )}
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
  linkBoton: { color: 'var(--teal-dark)', fontSize: '13px', textDecoration: 'none', fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' },

  // Panel flotante del traspaso: se queda fijo en la esquina mientras se
  // recorre la lista de alertas, para no tener que bajar hasta el final de
  // la página para agregar, revisar o crear el traspaso.
  flotanteContenedor: {
    position: 'fixed',
    right: '20px',
    bottom: '20px',
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '10px',
  },
  botonFlotante: {
    padding: '13px 20px',
    borderRadius: '999px',
    border: 'none',
    background: 'var(--teal)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '14px',
    boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
  },
  flotantePanel: {
    width: '320px',
    maxHeight: '70vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
    padding: '14px',
  },
  flotanteHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  btnCerrarFlotante: { border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--text-secondary)' },
  flotanteItems: { overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '2px' },
  flotanteFila: { display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' },
  inputCantidadChico: { width: '48px', padding: '5px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px' },
  btnQuitarChico: { border: 'none', background: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '13px' },
  flotanteTotal: { marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)', fontSize: '14px' },
  btnPrimarioAncho: {
    marginTop: '10px',
    width: '100%',
    padding: '11px 14px',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--teal)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '13px',
  },
};
