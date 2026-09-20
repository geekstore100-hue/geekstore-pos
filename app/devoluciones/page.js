'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '../../components/Shell';

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function primerDiaMesISO() {
  return hoyISO().slice(0, 8) + '01';
}

export default function DevolucionesPage() {
  const [productos, setProductos] = useState([]);
  const [cargandoProductos, setCargandoProductos] = useState(true);

  const [busqueda, setBusqueda] = useState('');
  const [mostrarLista, setMostrarLista] = useState(false);
  const [productoElegido, setProductoElegido] = useState(null);

  const [cantidad, setCantidad] = useState('1');
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [errorDevolucion, setErrorDevolucion] = useState('');
  const [mensaje, setMensaje] = useState('');

  const [desde, setDesde] = useState(primerDiaMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [devoluciones, setDevoluciones] = useState([]);
  const [cargandoLista, setCargandoLista] = useState(true);

  async function cargarProductos() {
    setCargandoProductos(true);
    const res = await fetch('/api/productos');
    const data = await res.json();
    if (data.ok) setProductos(data.productos);
    setCargandoProductos(false);
  }

  async function cargarDevoluciones() {
    setCargandoLista(true);
    const res = await fetch(`/api/devoluciones?desde=${desde}&hasta=${hasta}`);
    const data = await res.json();
    if (data.ok) setDevoluciones(data.devoluciones);
    setCargandoLista(false);
  }

  useEffect(() => {
    cargarProductos();
    cargarDevoluciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    return productos
      .filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          (p.referencia || '').toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [busqueda, productos]);

  function elegirProducto(p) {
    setProductoElegido(p);
    setBusqueda(`${p.referencia ? p.referencia + ' - ' : ''}${p.nombre}`);
    setMostrarLista(false);
    setCantidad(p.es_inventariable === false ? '' : '1');
    const precioBase = Number(p.precio_venta || 0);
    setMonto(precioBase ? String(precioBase) : '');
    setErrorDevolucion('');
    setMensaje('');
  }

  function limpiarFormulario() {
    setProductoElegido(null);
    setBusqueda('');
    setCantidad('1');
    setMonto('');
    setMotivo('');
    setErrorDevolucion('');
  }

  async function registrarDevolucion(e) {
    e.preventDefault();
    setErrorDevolucion('');
    setMensaje('');

    if (!productoElegido) {
      setErrorDevolucion('Busca y selecciona el producto que devuelven');
      return;
    }
    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0) {
      setErrorDevolucion('Ingresa un valor a devolver mayor a 0');
      return;
    }
    const cantidadNum = Number(cantidad) || 0;

    setProcesando(true);
    const res = await fetch('/api/devoluciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        producto_id: productoElegido.id,
        cantidad: cantidadNum,
        monto: montoNum,
        motivo,
      }),
    });
    const data = await res.json();
    setProcesando(false);
    if (data.ok) {
      setMensaje(`Devolución registrada: ${moneda(montoNum)} en efectivo.`);
      limpiarFormulario();
      cargarDevoluciones();
      cargarProductos();
    } else {
      setErrorDevolucion(data.error || 'No se pudo procesar la devolución');
    }
  }

  function moneda(n) {
    return `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
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

  return (
    <Shell title="Devoluciones">
      <div style={styles.buscarCard}>
        <h3 style={{ marginTop: 0 }}>Registrar devolución</h3>
        <form onSubmit={registrarDevolucion}>
          <div style={{ position: 'relative', maxWidth: '420px', marginBottom: '14px' }}>
            <label style={styles.labelCampo}>Producto</label>
            <input
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setMostrarLista(true);
                setProductoElegido(null);
              }}
              onFocus={() => setMostrarLista(true)}
              placeholder="Busca por nombre o referencia..."
              style={styles.inputCampo}
              autoComplete="off"
            />
            {mostrarLista && resultados.length > 0 && (
              <div style={styles.dropdown}>
                {resultados.map((p) => (
                  <div key={p.id} style={styles.dropdownItem} onClick={() => elegirProducto(p)}>
                    <strong>{p.nombre}</strong>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px', marginLeft: '8px' }}>
                      {p.referencia}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {!cargandoProductos && mostrarLista && busqueda.trim() && resultados.length === 0 && (
              <div style={styles.dropdown}>
                <div style={{ padding: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Sin resultados
                </div>
              </div>
            )}
          </div>

          {productoElegido && (
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {productoElegido.es_inventariable !== false && (
                <label style={styles.labelCampo}>
                  Cantidad a devolver al inventario
                  <input
                    type="number"
                    min="0"
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    style={styles.inputCampo}
                  />
                </label>
              )}
              <label style={styles.labelCampo}>
                Valor a devolver
                <input
                  type="number"
                  min="0"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  style={styles.inputCampo}
                />
              </label>
              <label style={{ ...styles.labelCampo, flex: 1, minWidth: '200px' }}>
                Motivo (opcional)
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  style={styles.inputCampo}
                  placeholder="Ej: producto defectuoso"
                />
              </label>
            </div>
          )}

          {errorDevolucion && <p style={{ color: 'var(--danger)' }}>{errorDevolucion}</p>}
          {mensaje && <p style={{ color: 'var(--teal-dark)' }}>{mensaje}</p>}

          <button type="submit" disabled={procesando || !productoElegido} style={styles.btnPrimario}>
            {procesando ? 'Procesando...' : 'Registrar devolución en efectivo'}
          </button>
        </form>
      </div>

      <h3 style={{ marginTop: '32px' }}>Devoluciones recientes</h3>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '16px' }}>
        <label>
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={styles.input} />
        </label>
        <label>
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={styles.input} />
        </label>
        <button onClick={cargarDevoluciones} style={styles.btnPrimario}>Consultar</button>
      </div>

      <div style={styles.tableCard}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={styles.th}>Fecha</th>
              <th style={styles.th}>Producto</th>
              <th style={styles.th}>Cantidad</th>
              <th style={styles.th}>Monto</th>
              <th style={styles.th}>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {devoluciones.map((d) => (
              <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={styles.td}>{fechaHora(d.creado_en)}</td>
                <td style={styles.td}>{d.nombre}</td>
                <td style={styles.td}>{d.cantidad}</td>
                <td style={styles.td}>{moneda(d.monto)}</td>
                <td style={styles.td}>{d.motivo || '-'}</td>
              </tr>
            ))}
            {devoluciones.length === 0 && !cargandoLista && (
              <tr><td style={styles.td} colSpan={5}>Sin devoluciones en ese rango.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

const styles = {
  buscarCard: {
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '20px',
    marginBottom: '20px',
  },
  input: { display: 'block', padding: '9px', marginTop: '4px', borderRadius: '8px', border: '1px solid var(--border)' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600, height: '38px' },
  btnSecundario: { padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '13px' },
  tableCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px', marginBottom: '20px' },
  th: { padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)' },
  td: { padding: '10px 8px', fontSize: '14px' },
  labelCampo: { display: 'block', fontSize: '12px', color: 'var(--text-secondary)' },
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
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    marginTop: '4px',
    maxHeight: '260px',
    overflowY: 'auto',
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    zIndex: 50,
  },
  dropdownItem: {
    padding: '10px 12px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border)',
    fontSize: '13px',
  },
};
