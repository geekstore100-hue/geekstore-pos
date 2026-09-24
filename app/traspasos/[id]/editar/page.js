'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Shell from '../../../../components/Shell';

export default function EditarTraspasoPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;

  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [traspaso, setTraspaso] = useState(null);
  const [lineas, setLineas] = useState([]); // [{producto_id, referencia, nombre, cantidad, precio_unitario}]
  const [observaciones, setObservaciones] = useState('');

  const [productosTodos, setProductosTodos] = useState([]);
  const [buscarTexto, setBuscarTexto] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // Cuánto hay AHORA MISMO en la bodega de origen de cada producto. Como este
  // traspaso ya se guardó antes, lo que ya está en cada línea YA SE LE
  // DESCONTÓ al origen, así que lo máximo que se puede poner en una línea que
  // ya existía es este stock actual MÁS lo que esa línea ya tenía comprometido
  // (por eso se guarda también cantidadOriginal por línea).
  const [stockOrigenPorProducto, setStockOrigenPorProducto] = useState({});

  async function cargar() {
    setCargando(true);
    setErrorCarga('');
    const res = await fetch(`/api/traspasos/${id}`);
    const data = await res.json();
    if (data.ok) {
      setTraspaso(data.traspaso);
      setObservaciones(data.traspaso.observaciones || '');
      setLineas(
        data.items.map((it) => ({
          producto_id: it.producto_id,
          referencia: it.referencia,
          nombre: it.nombre,
          cantidad: Number(it.cantidad),
          cantidadOriginal: Number(it.cantidad),
          precio_unitario: Number(it.precio_unitario) || 0,
        }))
      );
      if (data.traspaso.bodega_origen_id) {
        cargarStockOrigen(data.traspaso.bodega_origen_id);
      }
    } else {
      setErrorCarga(data.error || 'No se pudo cargar el traspaso');
    }
    setCargando(false);
  }

  async function cargarStockOrigen(bId) {
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

  async function cargarProductos() {
    const res = await fetch('/api/productos');
    const data = await res.json();
    if (data.ok) setProductosTodos(data.productos || []);
  }

  useEffect(() => {
    cargar();
    cargarProductos();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function actualizarCantidad(productoId, cantidad) {
    setLineas((prev) => prev.map((l) => (l.producto_id === productoId ? { ...l, cantidad: Number(cantidad) || 0 } : l)));
  }

  function quitarLinea(productoId) {
    setLineas((prev) => prev.filter((l) => l.producto_id !== productoId));
  }

  function agregarProducto(producto) {
    setBuscarTexto('');
    setLineas((prev) => {
      if (prev.find((l) => l.producto_id === producto.id)) return prev;
      return [
        ...prev,
        {
          producto_id: producto.id,
          referencia: producto.referencia,
          nombre: producto.nombre,
          cantidad: 1,
          cantidadOriginal: 0,
          precio_unitario: Number(producto.precio_costo) || 0,
        },
      ];
    });
  }

  const resultadosBusqueda = useMemo(() => {
    const texto = buscarTexto.trim().toLowerCase();
    if (!texto) return [];
    const yaAgregados = new Set(lineas.map((l) => l.producto_id));
    return productosTodos
      .filter((p) => p.activo !== false && p.es_inventariable !== false && !yaAgregados.has(p.id))
      .filter((p) => (p.nombre || '').toLowerCase().includes(texto) || (p.referencia || '').toLowerCase().includes(texto))
      .slice(0, 8);
  }, [buscarTexto, productosTodos, lineas]);

  const totalCalculado = useMemo(
    () => lineas.reduce((acc, l) => acc + l.precio_unitario * (Number(l.cantidad) || 0), 0),
    [lineas]
  );

  function moneda0(n) {
    return Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
  }

  async function guardar() {
    setError('');
    if (lineas.length === 0) {
      setError('El traspaso debe tener al menos un producto');
      return;
    }
    const invalida = lineas.find((l) => !l.cantidad || l.cantidad <= 0);
    if (invalida) {
      setError(`Revisa la cantidad de "${invalida.nombre}"`);
      return;
    }

    // La ventana se abre ANTES del await para que el navegador no la
    // bloquee como popup.
    const ventanaImpresion = window.open('', '_blank');

    setGuardando(true);
    const res = await fetch(`/api/traspasos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        observaciones,
        items: lineas.map((l) => ({ producto_id: l.producto_id, cantidad: Number(l.cantidad) })),
      }),
    });
    const data = await res.json();
    setGuardando(false);

    if (!data.ok) {
      if (ventanaImpresion) ventanaImpresion.close();
      setError(data.error || 'No se pudo guardar el traspaso');
      return;
    }

    if (ventanaImpresion) {
      ventanaImpresion.location = `/traspasos/${id}/imprimir`;
    }
    router.push('/reabastecimiento');
  }

  if (cargando) {
    return (
      <Shell title="Editar traspaso">
        <p style={{ color: 'var(--text-secondary)' }}>Cargando...</p>
      </Shell>
    );
  }

  if (errorCarga) {
    return (
      <Shell title="Editar traspaso">
        <p style={{ color: 'var(--danger)' }}>{errorCarga}</p>
      </Shell>
    );
  }

  if (traspaso.estado_pago === 'pagado') {
    return (
      <Shell title="Editar traspaso">
        <div style={styles.card}>
          <h2 style={{ marginTop: 0 }}>Este traspaso ya está pagado</h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            Como ya se marcó como pagado a {traspaso.bodega_origen_nombre}, no se puede editar. Si algo quedó mal,
            hazlo con un ajuste de inventario nuevo.
          </p>
          <a href={`/traspasos/${id}/imprimir`} target="_blank" rel="noreferrer" style={{ color: 'var(--teal-dark)', fontWeight: 600 }}>
            Ver / imprimir el documento
          </a>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Editar traspaso">
      <div style={styles.card}>
        <h2 style={{ marginTop: 0 }}>
          Editar traspaso #{traspaso.id}: {traspaso.bodega_origen_nombre} → {traspaso.bodega_destino_nombre}
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '-8px' }}>
          Corrige las cantidades, quita productos que no llegaron, o agrega los que faltaban. Al guardar se ajusta el
          stock de las dos bodegas para que quede correcto, y se abre el documento actualizado para imprimir de nuevo.
        </p>

        <label style={styles.labelCampo}>
          Observaciones
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            style={{ ...styles.inputCampo, minHeight: '50px' }}
          />
        </label>

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
            {lineas.map((l) => {
              // Lo que ya tenía esta línea guardado ya se le descontó al origen,
              // así que el tope real es el stock de hoy MÁS eso.
              const disponible = (stockOrigenPorProducto[l.producto_id] ?? 0) + (l.cantidadOriginal || 0);
              const excede = Number(l.cantidad) > disponible;
              return (
                <tr key={l.producto_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 600 }}>{l.nombre}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{l.referencia}</div>
                  </td>
                  <td style={{ ...styles.td, color: excede ? 'var(--danger)' : 'var(--text-secondary)' }}>
                    {disponible}
                  </td>
                  <td style={styles.td}>
                    <input
                      type="number"
                      min="1"
                      max={disponible || undefined}
                      value={l.cantidad}
                      onChange={(e) => actualizarCantidad(l.producto_id, e.target.value)}
                      style={{ ...styles.inputCelda, borderColor: excede ? 'var(--danger)' : undefined }}
                    />
                  </td>
                  <td style={styles.td}>${moneda0(l.precio_unitario)}</td>
                  <td style={styles.td}>${moneda0(l.precio_unitario * l.cantidad)}</td>
                  <td style={styles.td}>
                    <button onClick={() => quitarLinea(l.producto_id)} style={styles.btnQuitar}>Quitar</button>
                  </td>
                </tr>
              );
            })}
            {lineas.length === 0 && (
              <tr><td style={styles.td} colSpan={6}>Sin productos. Agrega al menos uno abajo.</td></tr>
            )}
            <tr>
              <td style={{ ...styles.td, position: 'relative' }}>
                <input
                  type="text"
                  value={buscarTexto}
                  onChange={(e) => setBuscarTexto(e.target.value)}
                  placeholder="+ Agregar otro producto (nombre o referencia)..."
                  style={styles.inputCampo}
                />
                {resultadosBusqueda.length > 0 && (
                  <div style={styles.dropdownBusqueda}>
                    {resultadosBusqueda.map((p) => (
                      <div key={p.id} style={styles.opcionBusqueda} onClick={() => agregarProducto(p)}>
                        <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '12px', marginLeft: '8px' }}>{p.referencia}</span>
                      </div>
                    ))}
                  </div>
                )}
              </td>
              <td style={styles.td} colSpan={5}></td>
            </tr>
          </tbody>
        </table>
        {lineas.some((l) => Number(l.cantidad) > (stockOrigenPorProducto[l.producto_id] ?? 0) + (l.cantidadOriginal || 0)) && (
          <p style={{ color: 'var(--danger)', fontSize: '13px', marginTop: '8px' }}>
            Hay una o más cantidades por encima de lo disponible en la bodega de origen. Al guardar, esas líneas serán rechazadas.
          </p>
        )}

        <div style={styles.resumen}>
          <div>Nuevo valor total: <strong>${moneda0(totalCalculado)}</strong></div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <a href="/reabastecimiento" style={styles.btnSecundario}>Cancelar</a>
            <button onClick={guardar} disabled={guardando} style={styles.btnPrimario}>
              {guardando ? 'Guardando...' : 'Guardar cambios e imprimir'}
            </button>
          </div>
        </div>

        {error && <p style={{ color: 'var(--danger)', marginTop: '10px' }}>{error}</p>}
      </div>
    </Shell>
  );
}

const styles = {
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '24px' },
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
  th: { padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)' },
  td: { padding: '10px 8px', fontSize: '14px' },
  inputCelda: { width: '70px', padding: '7px', borderRadius: '6px', border: '1px solid var(--border)' },
  btnQuitar: { padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '12px', color: 'var(--danger)' },
  resumen: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid var(--border)',
  },
  btnPrimario: { padding: '10px 18px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '14px' },
  btnSecundario: { padding: '10px 18px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '14px', textDecoration: 'none', color: 'var(--text)', display: 'inline-flex', alignItems: 'center' },
};
