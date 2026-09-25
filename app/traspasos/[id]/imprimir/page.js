'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

// Documento imprimible de un traspaso: se le entrega al vendedor para hacer
// la entrega formal de mercancía, y sirve para verificar en el momento
// cuánto había, cuánto llega y cuánto queda (columna en blanco para llenar
// a mano). No usa <Shell> a propósito: es una página aparte pensada para
// imprimirse sola, sin el menú del sistema.
export default function ImprimirTraspasoPage() {
  const params = useParams();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function cargar() {
      const res = await fetch(`/api/traspasos/${params.id}`);
      const data = await res.json();
      if (data.ok) {
        setDatos(data);
        setTimeout(() => window.print(), 400);
      } else {
        setError(data.error || 'No se pudo cargar el traspaso');
      }
    }
    cargar();
  }, [params.id]);

  function moneda(n) {
    return Number(n || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  }

  function numero(n) {
    return Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
  }

  // Algunas bodegas ya tienen "Bodega" en su propio nombre (como "Bodega
  // Distribuidor"), así que anteponerlo siempre daba "Bodega Bodega
  // Distribuidor" en el encabezado. Esto evita duplicarlo.
  function etiquetaBodega(nombre) {
    const n = nombre || '';
    return /^bodega\b/i.test(n.trim()) ? n : `Bodega ${n}`;
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

  if (error) {
    return <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif' }}>{error}</div>;
  }
  if (!datos) {
    return <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif' }}>Cargando...</div>;
  }

  const { traspaso, items } = datos;

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '30px', maxWidth: '820px', margin: '0 auto', color: '#111' }}>
      <style>{`
        @media print {
          @page { margin: 15mm; }
          .no-imprimir { display: none; }
        }
      `}</style>

      <button className="no-imprimir" onClick={() => window.print()} style={styles.btnImprimir}>
        Imprimir de nuevo
      </button>

      <h2 style={{ marginBottom: '2px' }}>Traspaso de mercancía #{traspaso.id}</h2>
      <p style={{ color: '#555', marginTop: 0 }}>{fechaHora(traspaso.creado_en)}</p>

      <table style={{ width: '100%', marginBottom: '20px', fontSize: '14px' }}>
        <tbody>
          <tr>
            <td style={styles.etiqueta}>De:</td>
            <td>{traspaso.bodega_origen_nombre}</td>
            <td style={styles.etiqueta}>A:</td>
            <td>{traspaso.bodega_destino_nombre}</td>
          </tr>
          {traspaso.observaciones && (
            <tr>
              <td style={styles.etiqueta}>Observaciones:</td>
              <td colSpan={3}>{traspaso.observaciones}</td>
            </tr>
          )}
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <th style={{ ...styles.th, ...styles.thNeutro }} rowSpan={2}>Referencia</th>
            <th style={{ ...styles.th, ...styles.thNeutro }} rowSpan={2}>Producto</th>
            <th style={{ ...styles.th, ...styles.thOrigen, textAlign: 'center' }}>
              {etiquetaBodega(traspaso.bodega_origen_nombre)} (entrega)
            </th>
            <th style={{ ...styles.th, ...styles.thDestino, textAlign: 'center' }} colSpan={3}>
              {etiquetaBodega(traspaso.bodega_destino_nombre)} (recibe)
            </th>
          </tr>
          <tr style={{ borderBottom: '2px solid #333', textAlign: 'left' }}>
            <th style={{ ...styles.th, ...styles.thOrigen, textAlign: 'right' }}>Queda disponible</th>
            <th style={{ ...styles.th, ...styles.thDestino, textAlign: 'right' }}>Ya había en {traspaso.bodega_destino_nombre}</th>
            <th style={{ ...styles.th, ...styles.thDestino, textAlign: 'right' }}>Llegan ahora</th>
            <th style={{ ...styles.th, ...styles.thDestino, textAlign: 'right' }}>Total esperado</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            // "Queda disponible" viene directo del stock ACTUAL de la bodega
            // de origen (calculado por la API), no de una foto vieja de
            // cuando se agregó el producto al traspaso — así siempre refleja
            // la realidad, incluso después de editar cantidades varias veces.
            const quedaOrigen = it.stock_actual_origen;
            return (
              <tr key={i} style={{ borderBottom: '1px solid #ccc' }}>
                <td style={styles.td}>{it.referencia}</td>
                <td style={styles.td}>{it.nombre}</td>
                <td style={{ ...styles.td, ...styles.tdOrigen, textAlign: 'right', fontWeight: 700 }}>
                  {numero(quedaOrigen)}
                </td>
                <td style={{ ...styles.td, ...styles.tdDestino, textAlign: 'right' }}>{numero(it.stock_antes)}</td>
                <td style={{ ...styles.td, ...styles.tdDestino, textAlign: 'right' }}>{numero(it.cantidad)}</td>
                <td style={{ ...styles.td, ...styles.tdDestino, textAlign: 'right', fontWeight: 700 }}>
                  {numero(Number(it.stock_antes || 0) + Number(it.cantidad))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ fontSize: '11px', color: '#777', marginTop: '4px' }}>
        "Queda disponible" es lo que le queda a {traspaso.bodega_origen_nombre} después de enviar esta mercancía —
        sirve para verificar ahí mismo cuánto sigue disponible en esa bodega.
      </p>

      <div style={{ textAlign: 'right', marginTop: '18px', fontSize: '16px' }}>
        <strong>Valor total del traspaso: {moneda(traspaso.valor_total)}</strong>
        <div style={{ fontSize: '13px', color: '#555' }}>
          ({traspaso.bodega_destino_nombre} le debe a {traspaso.bodega_origen_nombre} por esta mercancía —
          {traspaso.estado_pago === 'pagado' ? ' ya pagado' : ' pendiente de pago'})
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '70px' }}>
        <div style={{ textAlign: 'center', width: '45%' }}>
          <div style={{ borderTop: '1px solid #333', paddingTop: '6px' }}>Entregado por</div>
        </div>
        <div style={{ textAlign: 'center', width: '45%' }}>
          <div style={{ borderTop: '1px solid #333', paddingTop: '6px' }}>Recibido por</div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  etiqueta: { fontWeight: 700, padding: '4px 6px 4px 0' },
  th: { padding: '6px 4px' },
  td: { padding: '6px 4px' },
  // Para diferenciar a simple vista las columnas de la bodega que RECIBE
  // (destino) de la columna de la bodega que ENTREGA (origen).
  thNeutro: { borderBottom: '2px solid #333' },
  thDestino: { background: '#eef6f6', borderBottom: '2px solid #333' },
  thOrigen: { background: '#fbf3e6', borderBottom: '2px solid #333' },
  tdDestino: { background: '#f6fbfb' },
  tdOrigen: { background: '#fdf8ef' },
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
