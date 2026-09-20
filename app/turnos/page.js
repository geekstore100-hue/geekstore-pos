'use client';

import { useEffect, useState, Fragment } from 'react';
import Shell from '../../components/Shell';

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function primerDiaMesISO() {
  return hoyISO().slice(0, 8) + '01';
}

export default function TurnosHistorialPage() {
  const [desde, setDesde] = useState(primerDiaMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [turnos, setTurnos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [expandidoId, setExpandidoId] = useState(null);

  async function cargar() {
    setCargando(true);
    const res = await fetch(`/api/turnos/historial?desde=${desde}&hasta=${hasta}`);
    const data = await res.json();
    if (data.ok) setTurnos(data.turnos);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function moneda(n) {
    return `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
  }

  function fechaHora(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <Shell title="Historial de turnos">
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

      <div style={styles.tableCard}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={styles.th}>Apertura</th>
              <th style={styles.th}>Cierre</th>
              <th style={styles.th}>Estado</th>
              <th style={styles.th}>Total ventas</th>
              <th style={styles.th}>Dinero esperado</th>
              <th style={styles.th}>Dinero real</th>
              <th style={styles.th}>Diferencia</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {turnos.map((t) => {
              const coincide = t.diferencia !== null && Math.abs(t.diferencia) < 1;
              return (
                <Fragment key={t.id}>
                  <tr style={styles.filaClickeable} onClick={() => setExpandidoId(expandidoId === t.id ? null : t.id)}>
                    <td style={styles.td}>{fechaHora(t.abierto_en)}</td>
                    <td style={styles.td}>{fechaHora(t.cerrado_en)}</td>
                    <td style={styles.td}>
                      {t.estado === 'abierto' ? (
                        <span style={styles.badgeAbierto}>Abierto</span>
                      ) : (
                        <span style={styles.badgeCerrado}>Cerrado</span>
                      )}
                    </td>
                    <td style={styles.td}>{moneda(t.total_ventas)}</td>
                    <td style={styles.td}>{moneda(t.dinero_esperado)}</td>
                    <td style={styles.td}>{t.dinero_real_caja === null ? '-' : moneda(t.dinero_real_caja)}</td>
                    <td style={styles.td}>
                      {t.diferencia === null ? (
                        '-'
                      ) : (
                        <span style={{ color: coincide ? 'var(--teal-dark)' : 'var(--danger)', fontWeight: 600 }}>
                          {t.diferencia > 0 ? '+' : ''}
                          {moneda(t.diferencia)}
                        </span>
                      )}
                    </td>
                    <td style={styles.td}>{expandidoId === t.id ? '▲' : '▼'}</td>
                  </tr>
                  {expandidoId === t.id && (
                    <tr>
                      <td style={styles.td} colSpan={8}>
                        <div style={styles.detalle}>
                          <div style={styles.filaResumen}><span>Base inicial</span><strong>{moneda(t.base_inicial)}</strong></div>
                          <div style={styles.filaResumen}><span>Ventas en efectivo</span><strong>{moneda(t.ventas_efectivo)}</strong></div>
                          <div style={styles.filaResumen}><span>Ventas por tarjeta</span><strong>{moneda(t.ventas_tarjeta)}</strong></div>
                          <div style={styles.filaResumen}><span>Ventas por transferencia</span><strong>{moneda(t.ventas_transferencia)}</strong></div>
                          <div style={styles.filaResumen}><span>Otros medios de pago</span><strong>{moneda(t.ventas_otro)}</strong></div>
                          <div style={styles.filaResumen}><span>Devolución de dinero</span><strong>{moneda(t.devolucion_dinero)}</strong></div>
                          {t.observaciones && (
                            <div style={styles.filaResumen}><span>Observaciones</span><span>{t.observaciones}</span></div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {turnos.length === 0 && !cargando && (
              <tr><td style={styles.td} colSpan={8}>Sin turnos en ese rango.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

const styles = {
  input: { display: 'block', padding: '9px', marginTop: '4px', borderRadius: '8px', border: '1px solid var(--border)' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600, height: '38px' },
  tableCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 16px' },
  th: { padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)' },
  td: { padding: '10px 8px', fontSize: '14px' },
  filaClickeable: { borderBottom: '1px solid var(--border)', cursor: 'pointer' },
  badgeAbierto: { color: 'var(--teal-dark)', fontSize: '12px', fontWeight: 600 },
  badgeCerrado: { color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600 },
  detalle: {
    background: 'var(--bg)',
    borderRadius: '8px',
    padding: '14px',
    maxWidth: '420px',
  },
  filaResumen: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px' },
};
