'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

// Documento imprimible de un ajuste de inventario (botón "Ver / imprimir" en
// Ajustes recientes, o "Imprimir" justo después de guardar). Sirve de
// soporte físico del ajuste: qué se aumentó, qué se disminuyó, a qué costo
// y quién lo hizo/revisó. No usa <Shell> a propósito: es una página aparte
// pensada para imprimirse sola, sin el menú del sistema.
export default function ImprimirAjustePage() {
  const params = useParams();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function cargar() {
      const res = await fetch(`/api/ajustes-inventario/${params.id}`);
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setDatos(data);
        setTimeout(() => window.print(), 400);
      } else {
        setError(data.error || 'No se pudo cargar el ajuste');
      }
    }
    cargar();
  }, [params.id]);

  function moneda(n) {
    const valor = Math.round(Number(n || 0));
    const texto = Math.abs(valor).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
    return valor < 0 ? `-${texto}` : texto;
  }

  function numero(n) {
    return Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
  }

  function fechaHora(iso) {
    return new Date(iso).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
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

  const { ajuste, items } = datos;
  const subtotal = (it) => (it.objetivo === 'disminuir' ? -1 : 1) * Number(it.cantidad) * Number(it.precio_unitario);
  const totalAumentos = items.filter((it) => it.objetivo !== 'disminuir').reduce((acc, it) => acc + subtotal(it), 0);
  const totalDisminuciones = items.filter((it) => it.objetivo === 'disminuir').reduce((acc, it) => acc + subtotal(it), 0);
  const totalNeto = totalAumentos + totalDisminuciones;
  const rojo = (n) => (Number(n) < 0 ? { color: '#b42318' } : {});

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '30px', maxWidth: '820px', margin: '0 auto', color: '#111' }}>
      <style>{`
        body { background: #fff !important; }
        @media print {
          @page { margin: 15mm; }
          .no-imprimir { display: none; }
        }
      `}</style>

      <button className="no-imprimir" onClick={() => window.print()} style={styles.btnImprimir}>
        Imprimir de nuevo
      </button>

      <h2 style={{ marginBottom: '2px' }}>Ajuste de inventario #{ajuste.id}</h2>
      <p style={{ color: '#555', marginTop: 0 }}>Geek Store · {fechaHora(ajuste.creado_en)}</p>

      <table style={{ width: '100%', marginBottom: '20px', fontSize: '14px' }}>
        <tbody>
          <tr>
            <td style={styles.etiqueta}>Bodega:</td>
            <td>{ajuste.bodega_nombre || '-'}</td>
          </tr>
          {ajuste.observaciones && (
            <tr>
              <td style={styles.etiqueta}>Observaciones:</td>
              <td style={{ whiteSpace: 'pre-line' }}>{ajuste.observaciones}</td>
            </tr>
          )}
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #333' }}>
            <th style={styles.th}>Referencia</th>
            <th style={styles.th}>Producto</th>
            <th style={styles.th}>Tipo</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Cantidad</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Costo unit.</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const disminuye = it.objetivo === 'disminuir';
            return (
              <tr key={it.id} style={{ borderBottom: '1px solid #ccc' }}>
                <td style={styles.td}>{it.referencia}</td>
                <td style={styles.td}>{it.nombre}</td>
                <td style={{ ...styles.td, ...(disminuye ? { color: '#b42318' } : {}) }}>{disminuye ? 'Disminución' : 'Aumento'}</td>
                <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700, ...(disminuye ? { color: '#b42318' } : {}) }}>
                  {disminuye ? '-' : '+'}
                  {numero(it.cantidad)}
                </td>
                <td style={{ ...styles.td, textAlign: 'right' }}>{moneda(it.precio_unitario)}</td>
                <td style={{ ...styles.td, textAlign: 'right', ...rojo(subtotal(it)) }}>{moneda(subtotal(it))}</td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td style={styles.td} colSpan={6}>Este ajuste no tiene productos.</td>
            </tr>
          )}
        </tbody>
      </table>

      <table style={{ marginLeft: 'auto', marginTop: '18px', fontSize: '14px', minWidth: '300px' }}>
        <tbody>
          {totalAumentos !== 0 && (
            <tr>
              <td style={styles.resumenEtiqueta}>Total aumentos</td>
              <td style={styles.resumenValor}>{moneda(totalAumentos)}</td>
            </tr>
          )}
          {totalDisminuciones !== 0 && (
            <tr>
              <td style={styles.resumenEtiqueta}>Total disminuciones</td>
              <td style={{ ...styles.resumenValor, ...rojo(totalDisminuciones) }}>{moneda(totalDisminuciones)}</td>
            </tr>
          )}
          <tr style={{ borderTop: '2px solid #333' }}>
            <td style={{ ...styles.resumenEtiqueta, fontWeight: 700, fontSize: '16px' }}>Total del ajuste</td>
            <td style={{ ...styles.resumenValor, fontWeight: 700, fontSize: '16px', ...rojo(totalNeto) }}>{moneda(totalNeto)}</td>
          </tr>
        </tbody>
      </table>
      <p style={{ fontSize: '11px', color: '#777', marginTop: '4px', textAlign: 'right' }}>
        Valores al costo del producto. En rojo, lo que se quitó del inventario.
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '70px' }}>
        <div style={{ textAlign: 'center', width: '45%' }}>
          <div style={{ borderTop: '1px solid #333', paddingTop: '6px' }}>Realizado por</div>
        </div>
        <div style={{ textAlign: 'center', width: '45%' }}>
          <div style={{ borderTop: '1px solid #333', paddingTop: '6px' }}>Revisado por</div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  etiqueta: { fontWeight: 700, padding: '4px 10px 4px 0', width: '120px', verticalAlign: 'top' },
  th: { padding: '6px 4px' },
  td: { padding: '6px 4px' },
  resumenEtiqueta: { padding: '4px 16px 4px 0' },
  resumenValor: { padding: '4px 0', textAlign: 'right' },
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
