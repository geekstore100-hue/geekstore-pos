'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import ChequeoSemanal from '../../components/ChequeoSemanal';

// Historial del chequeo semanal de inventario (últimas 12 semanas): qué 2
// productos salieron cada semana, cuánto dijo el sistema, cuánto contó el
// vendedor, y si coincidió. Si no coincide, la corrección se hace a mano
// desde Ajustes de inventario (el sistema no la hace solo, a propósito).
export default function ChequeosInventarioPage() {
  const [historial, setHistorial] = useState([]);
  const [semanaActual, setSemanaActual] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  async function cargar() {
    setCargando(true);
    try {
      const res = await fetch('/api/conteo-rutinario?historial=1');
      const data = await res.json();
      if (data.ok) {
        setHistorial(data.historial || []);
        setSemanaActual(data.semana);
      } else {
        setError(data.error || 'No se pudo cargar el historial');
      }
    } catch {
      setError('No se pudo cargar el historial');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  function fechaSemana(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(a, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fechaHora(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  const noCoinciden = historial.filter((h) => h.contado && !h.coincide).length;
  const sinHacer = historial.filter((h) => !h.contado && h.semana !== semanaActual).length;

  return (
    <Shell title="Chequeo semanal de inventario">
      <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
        Cada lunes el sistema escoge al azar 2 productos con existencias en la bodega Principal para que un vendedor los
        cuente. Si el conteo no coincide con el sistema, queda marcado aquí para que lo revises (y lo corrijas desde
        Ajustes de inventario si hace falta).
      </p>

      <ChequeoSemanal enLinea siempreVisible alGuardar={cargar} />

      {!cargando && !error && (noCoinciden > 0 || sinHacer > 0) && (
        <p style={{ fontSize: '13px', color: 'var(--danger)', fontWeight: 600 }}>
          {noCoinciden > 0 && `${noCoinciden} conteo${noCoinciden === 1 ? '' : 's'} no coincidi${noCoinciden === 1 ? 'ó' : 'eron'}. `}
          {sinHacer > 0 && `${sinHacer} producto${sinHacer === 1 ? '' : 's'} de semanas anteriores nunca se cont${sinHacer === 1 ? 'ó' : 'aron'}.`}
        </p>
      )}

      {cargando ? (
        <p>Cargando...</p>
      ) : error ? (
        <p style={{ color: 'var(--danger)' }}>{error}</p>
      ) : (
        <div className="pos-tabla-scroll" style={styles.tableCard}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={styles.th}>Semana</th>
                <th style={styles.th}>Producto</th>
                <th style={styles.th}>Sistema</th>
                <th style={styles.th}>Contado</th>
                <th style={styles.th}>Resultado</th>
                <th style={styles.th}>Quién / cuándo</th>
              </tr>
            </thead>
            <tbody>
              {historial.length === 0 && (
                <tr><td colSpan={6} style={{ ...styles.td, color: 'var(--text-secondary)' }}>Todavía no hay chequeos.</td></tr>
              )}
              {historial.map((h) => (
                <tr key={h.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={styles.td}>Lunes {fechaSemana(h.semana)}</td>
                  <td style={styles.td}>
                    {h.nombre}
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Ref. {h.referencia}</div>
                  </td>
                  <td style={styles.td}>{h.contado ? h.stock_sistema : '—'}</td>
                  <td style={styles.td}>{h.contado ? h.cantidad_contada : '—'}</td>
                  <td style={styles.td}>
                    {!h.contado ? (
                      <span style={h.semana === semanaActual ? styles.chipPendiente : styles.chipNoHecho}>
                        {h.semana === semanaActual ? 'Pendiente' : 'No se hizo'}
                      </span>
                    ) : h.coincide ? (
                      <span style={styles.chipOk}>Coincide</span>
                    ) : (
                      <span style={styles.chipMal}>
                        {h.diferencia > 0 ? `Sobran ${h.diferencia}` : `Faltan ${Math.abs(h.diferencia)}`}
                      </span>
                    )}
                    {h.observaciones && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{h.observaciones}</div>}
                  </td>
                  <td style={styles.td}>
                    {h.contado ? (
                      <>
                        {h.vendedor_nombre || '—'}
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{fechaHora(h.contado_en)}</div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}

const styles = {
  tableCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 16px' },
  th: { padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)' },
  td: { padding: '10px 8px', fontSize: '14px', verticalAlign: 'top' },
  chipOk: { padding: '3px 10px', borderRadius: '999px', background: 'var(--teal-light)', color: 'var(--teal-dark)', fontSize: '12px', fontWeight: 600 },
  chipMal: { padding: '3px 10px', borderRadius: '999px', background: '#fee2e2', color: '#991b1b', fontSize: '12px', fontWeight: 600 },
  chipPendiente: { padding: '3px 10px', borderRadius: '999px', background: '#e0f2fe', color: '#075985', fontSize: '12px', fontWeight: 600 },
  chipNoHecho: { padding: '3px 10px', borderRadius: '999px', background: '#f3f4f6', color: '#6b7280', fontSize: '12px', fontWeight: 600 },
};
