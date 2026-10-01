'use client';

import { useEffect, useState, Fragment } from 'react';
import Shell from '../../components/Shell';

// Fecha de HOY en hora de Colombia (AAAA-MM-DD). Antes usaba
// toISOString(), que da la fecha en hora UTC (5 horas adelante): después de
// las 7:00 p. m. ya daba la fecha de MAÑANA, y la vista de "hoy" salía vacía.
function hoyISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
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
  // Arqueos de caja de cada turno (se cargan al abrir el detalle).
  const [arqueosPorTurno, setArqueosPorTurno] = useState({});

  async function alternarDetalle(id) {
    const abrir = expandidoId !== id;
    setExpandidoId(abrir ? id : null);
    if (abrir && !arqueosPorTurno[id]) {
      try {
        const res = await fetch(`/api/arqueos?turno_id=${id}`);
        const data = await res.json();
        setArqueosPorTurno((a) => ({ ...a, [id]: data.ok ? data.arqueos : [] }));
      } catch {
        setArqueosPorTurno((a) => ({ ...a, [id]: [] }));
      }
    }
  }

  function hora(iso) {
    return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

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
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '16px', flexWrap: 'wrap' }}>
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

      <div className="pos-tabla-scroll" style={styles.tableCard}>
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
                  <tr style={styles.filaClickeable} onClick={() => alternarDetalle(t.id)}>
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
                        <div style={{ ...styles.detalle, marginTop: '10px', maxWidth: '620px' }}>
                          <strong style={{ fontSize: '13px' }}>Arqueos de caja del turno</strong>
                          {!arqueosPorTurno[t.id] ? (
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '6px 0 0' }}>Cargando...</p>
                          ) : arqueosPorTurno[t.id].length === 0 ? (
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '6px 0 0' }}>No se hizo ningún arqueo en este turno.</p>
                          ) : (
                            arqueosPorTurno[t.id].map((a) => {
                              const dif = Number(a.diferencia);
                              const cuadra = Math.abs(dif) < 1;
                              return (
                                <div key={a.id} style={{ ...styles.filaResumen, borderTop: '1px solid var(--border)', marginTop: '4px', paddingTop: '6px', flexWrap: 'wrap', gap: '6px' }}>
                                  <span>
                                    {hora(a.creado_en)} {a.programado ? '(programado)' : ''} — {a.vendedor_nombre || 'sin nombre'}
                                    {a.observaciones && <span style={{ display: 'block', color: 'var(--text-secondary)' }}>{a.observaciones}</span>}
                                  </span>
                                  <span>
                                    Contado {moneda(a.dinero_contado)} / esperado {moneda(a.dinero_esperado)}{' '}
                                    <strong style={{ color: cuadra ? 'var(--teal-dark)' : 'var(--danger)' }}>
                                      {cuadra ? 'Cuadra' : `${dif > 0 ? '+' : ''}${moneda(dif)}`}
                                    </strong>
                                  </span>
                                </div>
                              );
                            })
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
