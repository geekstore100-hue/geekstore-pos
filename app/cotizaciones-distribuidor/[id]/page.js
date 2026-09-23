'use client';

import { useEffect, useState, use as usePromise } from 'react';
import Link from 'next/link';
import Shell from '../../../components/Shell';

const moneda = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

export default function CotizacionDistribuidorPage({ params }) {
  const { id } = usePromise(params);
  const [cotizacion, setCotizacion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [cambiando, setCambiando] = useState(false);

  function cargar() {
    setCargando(true);
    fetch(`/api/cotizaciones-distribuidor/${id}`)
      .then((r) => r.json())
      .then((d) => setCotizacion(d.cotizacion || null))
      .finally(() => setCargando(false));
  }

  useEffect(() => { cargar(); }, [id]);

  async function cambiarEstado(estado) {
    setCambiando(true);
    await fetch(`/api/cotizaciones-distribuidor/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    });
    await cargar();
    setCambiando(false);
  }

  if (cargando) {
    return <Shell title="Cotización de distribuidor"><p>Cargando…</p></Shell>;
  }
  if (!cotizacion) {
    return <Shell title="Cotización de distribuidor"><p>No se encontró esta cotización.</p></Shell>;
  }

  return (
    <Shell title={`Cotización ${cotizacion.numero}`}>
      <div style={{ maxWidth: 640 }}>
        <div className="pos-no-imprimir" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Link href="/cotizaciones-distribuidor" style={styles.botonSecundario}>← Volver</Link>
          <button onClick={() => window.print()} style={styles.boton}>🖨️ Imprimir</button>
          {cotizacion.estado === 'pendiente' ? (
            <button onClick={() => cambiarEstado('facturada')} disabled={cambiando} style={styles.botonSecundario}>
              {cambiando ? 'Guardando…' : '✓ Marcar como facturada'}
            </button>
          ) : (
            <button onClick={() => cambiarEstado('pendiente')} disabled={cambiando} style={styles.botonSecundario}>
              {cambiando ? 'Guardando…' : '↺ Volver a pendiente'}
            </button>
          )}
        </div>

        <div style={styles.hoja}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Geek Store</h1>
              <p style={{ color: '#667', margin: '2px 0 0', fontSize: '0.85rem' }}>Cotización de distribuidor</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontWeight: 700 }}>{cotizacion.numero}</p>
              <p style={{ margin: 0, color: '#667', fontSize: '0.85rem' }}>
                {new Date(cotizacion.creado_en).toLocaleString('es-CO')}
              </p>
              <p style={{ margin: '4px 0 0' }}>
                <span style={{ color: cotizacion.estado === 'facturada' ? '#067647' : '#b45309', fontWeight: 600 }}>
                  {cotizacion.estado === 'facturada' ? '✓ Facturada' : '⏳ Pendiente'}
                </span>
              </p>
            </div>
          </div>

          <p style={{ margin: '0 0 16px' }}>
            <strong>Distribuidor:</strong> {cotizacion.distribuidor_nombre} — cédula {cotizacion.distribuidor_cedula}
          </p>

          <table style={styles.tabla}>
            <thead>
              <tr>
                <th style={styles.th}>Referencia</th>
                <th style={styles.th}>Artículo</th>
                <th style={{ ...styles.th, textAlign: 'center' }}>Cant.</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Precio</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {cotizacion.items.map((it) => (
                <tr key={it.id}>
                  <td style={styles.td}>{it.referencia}</td>
                  <td style={styles.td}>{it.nombre}</td>
                  <td style={{ ...styles.td, textAlign: 'center' }}>{it.cantidad}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>{moneda(it.precio_unitario)}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>{moneda(it.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#667' }}>Total</p>
              <p style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>{moneda(cotizacion.total)}</p>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

const styles = {
  boton: {
    padding: '8px 14px', borderRadius: 6, border: 'none',
    background: 'var(--teal, #0d9488)', color: '#fff', fontWeight: 600, cursor: 'pointer',
  },
  botonSecundario: {
    padding: '8px 14px', borderRadius: 6, border: '1px solid #ddd', background: '#fff',
    color: '#374', fontWeight: 600, cursor: 'pointer', textDecoration: 'none', fontSize: '0.9rem',
    display: 'inline-flex', alignItems: 'center',
  },
  hoja: {
    background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: 24,
  },
  tabla: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #eee', color: '#667' },
  td: { padding: '6px 8px', borderBottom: '1px solid #f5f5f5' },
};
