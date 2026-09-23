'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '../../components/Shell';

const moneda = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

// Pedidos que hacen los distribuidores desde el portal de mayoristas de
// la tienda online. Quedan como cotización pendiente — no tocan stock
// ni generan ninguna venta. Acá se revisan, se imprimen, y cuando ya se
// facturaron (a mano, aparte) se marcan como tal solo para llevar
// registro de cuáles faltan por atender.
export default function CotizacionesDistribuidorPage() {
  const [cotizaciones, setCotizaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState('pendiente');

  function cargar() {
    setCargando(true);
    fetch('/api/cotizaciones-distribuidor')
      .then((r) => r.json())
      .then((d) => setCotizaciones(d.cotizaciones || []))
      .finally(() => setCargando(false));
  }

  useEffect(() => { cargar(); }, []);

  const visibles = cotizaciones.filter((c) => filtro === 'todas' || c.estado === filtro);

  return (
    <Shell title="Pedidos de distribuidores">
      <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        {['pendiente', 'facturada', 'todas'].map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            style={{
              ...styles.filtro,
              ...(filtro === f ? styles.filtroActivo : {}),
            }}
          >
            {f === 'pendiente' ? 'Pendientes' : f === 'facturada' ? 'Facturadas' : 'Todas'}
          </button>
        ))}
      </div>

      {cargando ? (
        <p>Cargando…</p>
      ) : visibles.length === 0 ? (
        <p style={{ color: '#889' }}>No hay cotizaciones {filtro !== 'todas' ? `en estado "${filtro}"` : ''} todavía.</p>
      ) : (
        <table style={styles.tabla}>
          <thead>
            <tr>
              <th style={styles.th}>Número</th>
              <th style={styles.th}>Distribuidor</th>
              <th style={styles.th}>Artículos</th>
              <th style={styles.th}>Total</th>
              <th style={styles.th}>Fecha</th>
              <th style={styles.th}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((c) => (
              <tr key={c.id}>
                <td style={styles.td}>
                  <Link href={`/cotizaciones-distribuidor/${c.id}`} style={{ color: 'var(--teal, #0d9488)' }}>
                    {c.numero}
                  </Link>
                </td>
                <td style={styles.td}>{c.distribuidor_nombre} <span style={{ color: '#aab' }}>({c.distribuidor_cedula})</span></td>
                <td style={styles.td}>{c.articulos}</td>
                <td style={styles.td}>{moneda(c.total)}</td>
                <td style={styles.td}>{new Date(c.creado_en).toLocaleString('es-CO')}</td>
                <td style={styles.td}>
                  <span style={{ color: c.estado === 'facturada' ? '#067647' : '#b45309' }}>
                    {c.estado === 'facturada' ? '✓ Facturada' : '⏳ Pendiente'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Shell>
  );
}

const styles = {
  filtro: {
    padding: '6px 14px', borderRadius: 999, border: '1px solid #ddd', background: '#fff',
    fontSize: '0.85rem', cursor: 'pointer', color: '#667',
  },
  filtroActivo: {
    background: 'var(--teal-light, #ccfbf1)', color: 'var(--teal-dark, #0f766e)',
    borderColor: 'var(--teal, #0d9488)', fontWeight: 600,
  },
  tabla: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #eee', color: '#667' },
  td: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0' },
};
