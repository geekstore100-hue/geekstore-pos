'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function primerDiaMesISO() {
  return hoyISO().slice(0, 8) + '01';
}
function esHoy(iso) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export default function HistorialPage() {
  const [desde, setDesde] = useState(primerDiaMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [ventas, setVentas] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [panelAbierto, setPanelAbierto] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [anulandoId, setAnulandoId] = useState(null);
  const [errorAnular, setErrorAnular] = useState('');

  async function cargar() {
    setCargando(true);
    const res = await fetch(`/api/ventas?desde=${desde}&hasta=${hasta}`);
    const data = await res.json();
    if (data.ok) setVentas(data.ventas);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function abrirDetalle(id) {
    setPanelAbierto(true);
    setCargandoDetalle(true);
    setDetalle(null);
    const res = await fetch(`/api/ventas/${id}`);
    const data = await res.json();
    if (data.ok) setDetalle(data);
    setCargandoDetalle(false);
  }

  function cerrarPanel() {
    setPanelAbierto(false);
    setDetalle(null);
  }

  async function anularVenta(id) {
    if (!window.confirm('¿Seguro que quieres anular esta venta? Esto devuelve el stock descontado.')) return;
    setErrorAnular('');
    setAnulandoId(id);
    const res = await fetch(`/api/ventas/${id}`, { method: 'POST' });
    const data = await res.json();
    setAnulandoId(null);

    if (data.ok) {
      cargar();
      if (detalle && detalle.venta.id === id) {
        abrirDetalle(id);
      }
    } else {
      setErrorAnular(data.error || 'No se pudo anular la venta');
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

  function lineaSubtotal(item) {
    const descuento = Number(item.descuento_porcentaje) || 0;
    return Number(item.precio_unitario) * Number(item.cantidad) * 1; // precio_unitario ya es neto (con descuento aplicado)
  }

  return (
    <Shell title="Historial">
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '16px' }}>
        <label>
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={styles.input} />
        </label>
        <label>
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={styles.input} />
        </label>
        <button onClick={cargar} style={styles.btnPrimario}>Consultar</button>
      </div>

      {errorAnular && <p style={{ color: 'var(--danger)' }}>{errorAnular}</p>}

      <div style={styles.tableCard}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={styles.th}>Fecha y hora</th>
              <th style={styles.th}>Medio de pago</th>
              <th style={styles.th}>Vendedor</th>
              <th style={styles.th}>Ítems</th>
              <th style={styles.th}>Total</th>
              <th style={styles.th}>Estado</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {ventas.map((v) => (
              <tr key={v.id} style={{ ...styles.filaClickeable, ...(v.anulada ? styles.filaAnulada : {}) }}>
                <td style={styles.td} onClick={() => abrirDetalle(v.id)}>{fechaHora(v.creado_en)}</td>
                <td style={styles.td} onClick={() => abrirDetalle(v.id)}>{v.medio_pago || '-'}</td>
                <td style={styles.td} onClick={() => abrirDetalle(v.id)}>{v.vendedor_nombre || '-'}</td>
                <td style={styles.td} onClick={() => abrirDetalle(v.id)}>{v.items}</td>
                <td style={styles.td} onClick={() => abrirDetalle(v.id)}>{moneda(v.total)}</td>
                <td style={styles.td} onClick={() => abrirDetalle(v.id)}>
                  {v.anulada ? <span style={styles.badgeAnulada}>Anulada</span> : <span style={styles.badgeActiva}>Activa</span>}
                </td>
                <td style={styles.td}>
                  {!v.anulada && esHoy(v.creado_en) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); anularVenta(v.id); }}
                      disabled={anulandoId === v.id}
                      style={styles.btnAnular}
                    >
                      {anulandoId === v.id ? 'Anulando...' : 'Anular'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {ventas.length === 0 && !cargando && (
              <tr>
                <td style={styles.td} colSpan={7}>Sin ventas en ese rango.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {panelAbierto && (
        <div style={styles.overlay} onMouseDown={cerrarPanel}>
          <div style={styles.panelLateral} onMouseDown={(e) => e.stopPropagation()}>
            <div style={styles.panelHeader}>
              <h3 style={{ margin: 0 }}>Detalle de venta</h3>
              <button type="button" onClick={cerrarPanel} style={styles.btnCerrarPanel}>×</button>
            </div>

            {cargandoDetalle && <p>Cargando...</p>}

            {detalle && (
              <>
                {detalle.venta.anulada && (
                  <div style={styles.avisoAnulada}>Esta venta fue anulada{detalle.venta.anulada_en ? ` el ${fechaHora(detalle.venta.anulada_en)}` : ''}.</div>
                )}
                <div style={styles.filaResumen}><span>Fecha y hora</span><strong>{fechaHora(detalle.venta.creado_en)}</strong></div>
                <div style={styles.filaResumen}><span>Medio de pago</span><strong>{detalle.venta.medio_pago || '-'}</strong></div>
                <div style={styles.filaResumen}><span>Vendedor</span><strong>{detalle.venta.vendedor_nombre || '-'}</strong></div>

                <h4 style={{ marginTop: '20px', marginBottom: '8px' }}>Artículos</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      <th style={styles.thChico}>Ref.</th>
                      <th style={styles.thChico}>Producto</th>
                      <th style={styles.thChico}>Precio</th>
                      <th style={styles.thChico}>Desc. %</th>
                      <th style={styles.thChico}>Cant.</th>
                      <th style={styles.thChico}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.items.map((item, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={styles.tdChico}>{item.referencia}</td>
                        <td style={styles.tdChico}>{item.nombre}</td>
                        <td style={styles.tdChico}>{moneda(item.precio_unitario)}</td>
                        <td style={styles.tdChico}>{item.descuento_porcentaje || 0}%</td>
                        <td style={styles.tdChico}>{item.cantidad}</td>
                        <td style={styles.tdChico}>{moneda(lineaSubtotal(item))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ ...styles.filaResumen, borderTop: '1px solid var(--border)', paddingTop: '10px', marginTop: '10px', fontWeight: 700 }}>
                  <span>Total</span><span>{moneda(detalle.venta.total)}</span>
                </div>

                {!detalle.venta.anulada && esHoy(detalle.venta.creado_en) && (
                  <button
                    onClick={() => anularVenta(detalle.venta.id)}
                    disabled={anulandoId === detalle.venta.id}
                    style={{ ...styles.btnAnular, width: '100%', marginTop: '16px', padding: '10px' }}
                  >
                    {anulandoId === detalle.venta.id ? 'Anulando...' : 'Anular esta venta'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}

const styles = {
  input: { display: 'block', padding: '9px', marginTop: '4px', borderRadius: '8px', border: '1px solid var(--border)' },
  th: { padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)' },
  td: { padding: '10px 8px', fontSize: '14px' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600, height: '38px' },
  tableCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 16px' },
  filaClickeable: { borderBottom: '1px solid var(--border)', cursor: 'pointer' },
  filaAnulada: { opacity: 0.55, textDecoration: 'line-through' },
  badgeActiva: { color: 'var(--teal-dark)', fontSize: '12px', fontWeight: 600 },
  badgeAnulada: { color: 'var(--danger)', fontSize: '12px', fontWeight: 600 },
  btnAnular: {
    padding: '7px 12px',
    borderRadius: '8px',
    border: '1px solid var(--danger)',
    background: '#fff',
    color: 'var(--danger)',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
  },
  avisoAnulada: {
    background: '#fdecea',
    color: 'var(--danger)',
    padding: '10px 12px',
    borderRadius: '8px',
    fontSize: '13px',
    marginBottom: '12px',
  },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100 },
  panelLateral: {
    position: 'fixed',
    top: 0,
    right: 0,
    height: '100vh',
    width: '460px',
    maxWidth: '92vw',
    background: '#fff',
    padding: '24px',
    overflowY: 'auto',
    boxShadow: '-8px 0 24px rgba(0,0,0,0.15)',
  },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  btnCerrarPanel: { border: 'none', background: 'none', fontSize: '22px', cursor: 'pointer', color: 'var(--text-secondary)', lineHeight: 1 },
  filaResumen: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px' },
  thChico: { padding: '6px 4px', fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'left' },
  tdChico: { padding: '6px 4px', fontSize: '13px' },
};
