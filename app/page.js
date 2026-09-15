'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '../components/Shell';

export default function Home() {
  const [ventas, setVentas] = useState([]);

  useEffect(() => {
    fetch('/api/ventas')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setVentas(d.ventas);
      });
  }, []);

  const totalHoy = ventas.reduce((acc, v) => acc + Number(v.total || 0), 0);

  function moneda(n) {
    return `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
  }

  return (
    <Shell title="Inicio">
      <div style={styles.stat}>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>Ventas de hoy</p>
        <p style={{ margin: '4px 0 0', fontSize: '28px', fontWeight: 700 }}>{moneda(totalHoy)}</p>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px' }}>{ventas.length} venta(s)</p>
      </div>

      <div style={styles.grid}>
        <Tarjeta href="/productos" titulo="Productos" descripcion="Catálogo y stock en Kennedy" />
        <Tarjeta href="/ventas" titulo="Vender" descripcion="Registrar venta de mostrador" />
        <Tarjeta href="/entradas" titulo="Entradas" descripcion="Registrar mercancía que llega" />
        <Tarjeta href="/reportes" titulo="Reportes" descripcion="Inventario y ventas por ítem" />
      </div>
    </Shell>
  );
}

function Tarjeta({ href, titulo, descripcion }) {
  return (
    <Link href={href} style={styles.tarjeta}>
      <strong>{titulo}</strong>
      <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{descripcion}</span>
    </Link>
  );
}

const styles = {
  stat: {
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '20px',
    marginBottom: '24px',
    maxWidth: '260px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
  },
  tarjeta: {
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    color: 'var(--text)',
    textDecoration: 'none',
  },
};
