'use client';

import { useState } from 'react';
import Shell from '../../components/Shell';

function fecha(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Búsqueda rápida de manifiestos de importación: para el momento en que
// aduana pide "el manifiesto de este producto" y hay que encontrarlo ya,
// sin tener que acordarse en qué factura de compra venía. Se busca por
// número de factura, proveedor, o referencia/nombre de un producto — el
// mismo adjunto también se puede ver/subir desde el detalle de la factura
// en Gastos > Facturas de compra.
export default function ManifiestosPage() {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');

  async function buscar(e) {
    e.preventDefault();
    setError('');
    if (!q.trim()) return;
    setBuscando(true);
    try {
      const res = await fetch(`/api/manifiestos/buscar?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      if (data.ok) setResultados(data.resultados);
      else setError(data.error || 'No se pudo buscar');
    } catch {
      setError('Error de conexión al buscar');
    } finally {
      setBuscando(false);
    }
  }

  return (
    <Shell title="Manifiestos de importación">
      <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
        Busca por número de factura, proveedor, o referencia/nombre de un producto, para encontrar rápido la factura
        de compra y su manifiesto de importación adjunto.
      </p>

      <form onSubmit={buscar} style={styles.barra}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ej. referencia del producto, número de factura o proveedor..."
          style={{ ...styles.input, flex: 1 }}
        />
        <button type="submit" disabled={buscando} style={styles.btnPrimario}>
          {buscando ? 'Buscando...' : 'Buscar'}
        </button>
      </form>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {resultados && resultados.length === 0 && (
        <p style={{ color: 'var(--text-secondary)' }}>No se encontró ninguna factura de compra que coincida.</p>
      )}

      {resultados && resultados.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {resultados.map((r) => (
            <div key={r.factura_compra_id} style={styles.tarjeta}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <strong>{r.numero || `FC-${r.factura_compra_id}`}</strong>
                  <span style={{ color: 'var(--text-secondary)' }}> — {r.proveedor_nombre} — {fecha(r.fecha_creacion)}</span>
                </div>
              </div>
              {r.items.length > 0 && (
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '6px 0' }}>
                  Productos: {r.items.map((it) => `${it.referencia} - ${it.nombre}`).join(', ')}
                </p>
              )}
              {r.manifiestos.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--danger)', margin: '6px 0 0' }}>
                  Esta factura no tiene ningún manifiesto adjunto todavía.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                  {r.manifiestos.map((m) => (
                    <a key={m.id} href={`/api/manifiestos/${m.archivo_key}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px' }}>
                      📄 {m.nombre_original || m.archivo_key}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}

const styles = {
  barra: { display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' },
  input: { padding: '9px', borderRadius: '8px', border: '1px solid var(--border)', minWidth: '220px' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  tarjeta: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' },
};
