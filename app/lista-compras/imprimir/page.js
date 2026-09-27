'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function moneda(n) {
  return Number(n || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
}
function numero(n) {
  return Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
}
function fechaHoy() {
  return new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Documento imprimible de la lista de compras, un pedido por proveedor
// (salto de página entre uno y otro, para poder entregar/mandar solo la
// hoja de un proveedor a la vez). Sin <Shell>, a propósito: página aparte
// para imprimirse sola. Con ?proveedor_id=X se imprime solo ese proveedor.
// useSearchParams exige un límite de Suspense alrededor, por eso el export
// por defecto solo envuelve al componente real que hace el trabajo.
export default function ImprimirListaComprasPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', fontFamily: 'Arial, sans-serif' }}>Cargando...</div>}>
      <ImprimirListaComprasContenido />
    </Suspense>
  );
}

function ImprimirListaComprasContenido() {
  const searchParams = useSearchParams();
  const proveedorId = searchParams.get('proveedor_id');
  const [grupos, setGrupos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function cargar() {
      const res = await fetch('/api/lista-compras');
      const data = await res.json();
      if (data.ok) {
        const filtrados = proveedorId
          ? data.grupos.filter((g) => String(g.proveedor_id || '') === String(proveedorId))
          : data.grupos;
        setGrupos(filtrados);
        setTimeout(() => window.print(), 400);
      } else {
        setError(data.error || 'No se pudo cargar la lista de compras');
      }
    }
    cargar();
  }, [proveedorId]);

  if (error) {
    return <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif' }}>{error}</div>;
  }
  if (!grupos) {
    return <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif' }}>Cargando...</div>;
  }
  if (grupos.length === 0) {
    return <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif' }}>No hay nada pendiente por comprar.</div>;
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '30px', maxWidth: '820px', margin: '0 auto', color: '#111' }}>
      <style>{`
        @media print {
          @page { margin: 15mm; }
          .no-imprimir { display: none; }
          .grupo-proveedor { page-break-after: always; }
          .grupo-proveedor:last-child { page-break-after: auto; }
        }
      `}</style>

      <button className="no-imprimir" onClick={() => window.print()} style={styles.btnImprimir}>
        Imprimir de nuevo
      </button>

      {grupos.map((grupo) => (
        <div key={grupo.proveedor_id || 'sin_proveedor'} className="grupo-proveedor">
          <h2 style={{ marginBottom: '2px' }}>Lista de compras — {grupo.proveedor_nombre}</h2>
          <p style={{ color: '#555', marginTop: 0 }}>{fechaHoy()}</p>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #333' }}>
                <th style={styles.th}>Referencia</th>
                <th style={styles.th}>Producto</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Cantidad</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Precio ref.</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {grupo.items.map((it) => (
                <tr key={it.id} style={{ borderBottom: '1px solid #ccc' }}>
                  <td style={styles.td}>{it.referencia}</td>
                  <td style={styles.td}>{it.producto_nombre}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>{numero(it.cantidad)}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>{it.precio_referencia ? moneda(it.precio_referencia) : '—'}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>
                    {it.precio_referencia ? moneda(Number(it.precio_referencia) * Number(it.cantidad)) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {grupo.total > 0 && (
            <div style={{ textAlign: 'right', marginTop: '10px', fontSize: '14px' }}>
              <strong>Total aproximado: {moneda(grupo.total)}</strong>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '60px' }}>
            <div style={{ textAlign: 'center', width: '45%' }}>
              <div style={{ borderTop: '1px solid #333', paddingTop: '6px' }}>Pedido por</div>
            </div>
            <div style={{ textAlign: 'center', width: '45%' }}>
              <div style={{ borderTop: '1px solid #333', paddingTop: '6px' }}>Recibido / confirmado por</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const styles = {
  th: { padding: '6px 4px' },
  td: { padding: '6px 4px' },
  btnImprimir: {
    float: 'right',
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid #333',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
  },
};
