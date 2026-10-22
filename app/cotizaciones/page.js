'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '../../components/Shell';
import { generarPdfCotizacion, numeroCotizacion, pesos } from '../../lib/cotizacionPdf';

// Cotizaciones para clientes (octubre 2026): lista + acceso rápido al PDF.

function fecha(d) {
  return new Date(d).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', year: 'numeric' });
}

export default function CotizacionesPage() {
  const [cotizaciones, setCotizaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [trabajando, setTrabajando] = useState(null);

  async function cargar(texto = '') {
    setCargando(true);
    setError('');
    try {
      const res = await fetch(`/api/cotizaciones${texto ? `?q=${encodeURIComponent(texto)}` : ''}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo cargar');
      setCotizaciones(data.cotizaciones || []);
    } catch (e) {
      setError(e.message);
    }
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => cargar(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  async function descargar(id) {
    setTrabajando(id);
    setError('');
    try {
      const [rc, re] = await Promise.all([fetch(`/api/cotizaciones/${id}`).then((r) => r.json()), fetch('/api/configuracion/datos-empresa').then((r) => r.json()).catch(() => ({}))]);
      if (!rc.ok) throw new Error(rc.error || 'No se pudo cargar');
      const doc = await generarPdfCotizacion(rc.cotizacion, re.ok ? re : {});
      doc.save(`Cotizacion-${numeroCotizacion(id)}-GeekStore.pdf`);
    } catch (e) {
      setError(`No se pudo crear el PDF: ${e.message}`);
    }
    setTrabajando(null);
  }

  async function eliminar(c) {
    if (!window.confirm(`¿Eliminar la cotización ${numeroCotizacion(c.id)}${c.cliente_nombre ? ` de ${c.cliente_nombre}` : ''}?`)) return;
    const res = await fetch(`/api/cotizaciones/${c.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      setError(data.error || 'No se pudo eliminar');
      return;
    }
    setCotizaciones((l) => l.filter((x) => x.id !== c.id));
  }

  return (
    <Shell title="Cotizaciones">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <h2 style={{ margin: 0 }}>Cotizaciones</h2>
        <Link href="/cotizaciones/nueva" style={s.btnPrimario}>+ Nueva cotización</Link>
      </div>

      <div style={s.card}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por cliente, celular, número o producto…" style={s.input} />
        {error && <p style={{ color: '#c0392b', margin: '10px 0 0' }}>{error}</p>}
      </div>

      <div style={s.card}>
        {cargando && !cotizaciones.length ? (
          <p style={{ margin: 0 }}>Cargando…</p>
        ) : cotizaciones.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            {q ? 'No hay cotizaciones que coincidan.' : 'Todavía no hay cotizaciones. Crea la primera con “+ Nueva cotización”.'}
          </p>
        ) : (
          cotizaciones.map((c) => (
            <div key={c.id} style={s.fila}>
              <Link href={`/cotizaciones/${c.id}`} style={{ flex: '1 1 240px', minWidth: 0, color: 'inherit', textDecoration: 'none' }}>
                <div style={{ fontWeight: 700 }}>
                  <span style={{ color: 'var(--teal-dark)' }}>{numeroCotizacion(c.id)}</span> · {c.cliente_nombre || 'Sin nombre'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {fecha(c.creado_en)} · {c.n_items} producto{Number(c.n_items) === 1 ? '' : 's'}
                  {c.cliente_telefono ? ` · ${c.cliente_telefono}` : ''}
                  {c.vendedor ? ` · ${c.vendedor}` : ''}
                </div>
              </Link>
              <strong style={{ fontSize: '16px', minWidth: '110px', textAlign: 'right' }}>{pesos(c.total)}</strong>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" onClick={() => descargar(c.id)} disabled={trabajando === c.id} style={s.btn}>
                  {trabajando === c.id ? '…' : '📄 PDF'}
                </button>
                <Link href={`/cotizaciones/${c.id}`} style={{ ...s.btn, textDecoration: 'none', color: 'inherit' }}>✏️ Abrir</Link>
                <button type="button" onClick={() => eliminar(c)} style={{ ...s.btn, color: '#c0392b' }} aria-label="Eliminar">🗑</button>
              </div>
            </div>
          ))
        )}
      </div>
    </Shell>
  );
}

const s = {
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 18px', marginBottom: '16px' },
  input: { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', boxSizing: 'border-box' },
  fila: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '12px 0', borderTop: '1px solid var(--border)' },
  btn: { padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '13px' },
  btnPrimario: { padding: '10px 16px', borderRadius: '8px', background: 'var(--teal)', color: '#fff', fontWeight: 700, textDecoration: 'none', fontSize: '14px' },
};
