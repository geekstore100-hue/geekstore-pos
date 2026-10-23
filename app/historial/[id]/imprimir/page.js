'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

// Comprobante de venta imprimible, tamaño carta (octubre 2026): botón
// "🖨️" en Historial y "Imprimir" en el detalle de la venta. Sirve para
// entregarle al cliente (o al distribuidor) el detalle de lo que compró.
// Página aparte, sin el menú del sistema; abre la ventana de impresión sola
// (ahí también se puede "Guardar como PDF").
export default function ImprimirVentaPage() {
  const params = useParams();
  const [datos, setDatos] = useState(null);
  const [empresa, setEmpresa] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    async function cargar() {
      const [res, resEmpresa] = await Promise.all([
        fetch(`/api/ventas/${params.id}`),
        fetch('/api/configuracion/datos-empresa').catch(() => null),
      ]);
      const data = await res.json().catch(() => ({}));
      const dataEmpresa = resEmpresa ? await resEmpresa.json().catch(() => ({})) : {};
      if (dataEmpresa?.ok) setEmpresa(dataEmpresa);
      if (data.ok) {
        setDatos(data);
        setTimeout(() => window.print(), 400);
      } else {
        setError(data.error || 'No se pudo cargar la venta');
      }
    }
    cargar();
  }, [params.id]);

  function moneda(n) {
    return Math.round(Number(n || 0)).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
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

  if (error) return <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif' }}>{error}</div>;
  if (!datos) return <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif' }}>Cargando...</div>;

  const { venta, items } = datos;
  const pagos = Array.isArray(datos.pagos) ? datos.pagos.filter((p) => Number(p.monto) > 0) : [];
  // precio_unitario ya trae el descuento aplicado; el precio "de lista" se
  // calcula de vuelta con el % de descuento.
  const lineas = items.map((it) => {
    const d = Number(it.descuento_porcentaje) || 0;
    const neto = Number(it.precio_unitario) || 0;
    const lista = d > 0 && d < 100 ? neto / (1 - d / 100) : neto;
    return { ...it, d, neto, lista, subtotal: neto * Number(it.cantidad) };
  });
  const hayDescuentos = lineas.some((l) => l.d > 0);
  const bruto = lineas.reduce((a, l) => a + l.lista * Number(l.cantidad), 0);
  const total = Number(venta.total) || lineas.reduce((a, l) => a + l.subtotal, 0);
  const descuentos = Math.max(0, bruto - total);
  const unidades = lineas.reduce((a, l) => a + Number(l.cantidad || 0), 0);

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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '18px' }}>
        <div>
          <h2 style={{ margin: '0 0 2px' }}>Comprobante de venta N.º {venta.id}</h2>
          <p style={{ color: '#555', margin: 0 }}>{fechaHora(venta.creado_en)}</p>
          {venta.anulada ? <p style={{ color: '#b42318', fontWeight: 700, margin: '4px 0 0' }}>ANULADA</p> : null}
        </div>
        <div style={{ textAlign: 'right', fontSize: '13px', color: '#333' }}>
          <strong style={{ fontSize: '15px' }}>{empresa.razonSocial || 'Geek Store'}</strong>
          {empresa.nit ? <div>NIT {empresa.nit}</div> : null}
          {empresa.direccion ? <div>{empresa.direccion}</div> : null}
          {empresa.ciudad || empresa.telefono ? <div>{[empresa.ciudad, empresa.telefono].filter(Boolean).join(' · ')}</div> : null}
          <div>geekstore.com.co</div>
        </div>
      </div>

      <table style={{ width: '100%', marginBottom: '20px', fontSize: '14px' }}>
        <tbody>
          <tr>
            <td style={styles.etiqueta}>Cliente:</td>
            <td>
              {venta.cliente_nombre || 'Cliente de mostrador'}
              {venta.cliente_documento ? ` — C.C./NIT ${venta.cliente_documento}` : ''}
              {venta.cliente_telefono ? ` · Tel. ${venta.cliente_telefono}` : ''}
            </td>
          </tr>
          {venta.cotizacion_numero ? (
            <tr>
              <td style={styles.etiqueta}>Pedido:</td>
              <td>{venta.cotizacion_numero}</td>
            </tr>
          ) : null}
          {venta.vendedor_nombre ? (
            <tr>
              <td style={styles.etiqueta}>Atendió:</td>
              <td>{venta.vendedor_nombre}</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #333' }}>
            <th style={styles.th}>Referencia</th>
            <th style={styles.th}>Producto</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Cant.</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Precio</th>
            {hayDescuentos ? <th style={{ ...styles.th, textAlign: 'right' }}>Desc.</th> : null}
            <th style={{ ...styles.th, textAlign: 'right' }}>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #ccc' }}>
              <td style={styles.td}>{l.referencia}</td>
              <td style={styles.td}>{l.nombre}</td>
              <td style={{ ...styles.td, textAlign: 'right' }}>{Number(l.cantidad)}</td>
              <td style={{ ...styles.td, textAlign: 'right' }}>{moneda(l.lista)}</td>
              {hayDescuentos ? (
                <td style={{ ...styles.td, textAlign: 'right' }}>{l.d > 0 ? `${Number(l.d.toFixed(2))}%` : '—'}</td>
              ) : null}
              <td style={{ ...styles.td, textAlign: 'right' }}>{moneda(l.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: '12px', color: '#555', margin: '6px 0 0' }}>
        {lineas.length} producto{lineas.length === 1 ? '' : 's'} · {unidades} unidad{unidades === 1 ? '' : 'es'}
      </p>

      <table style={{ marginLeft: 'auto', marginTop: '14px', fontSize: '14px', minWidth: '300px' }}>
        <tbody>
          {descuentos > 0.5 ? (
            <>
              <tr>
                <td style={styles.resumenEtiqueta}>Subtotal</td>
                <td style={styles.resumenValor}>{moneda(bruto)}</td>
              </tr>
              <tr>
                <td style={styles.resumenEtiqueta}>Descuentos</td>
                <td style={{ ...styles.resumenValor, color: '#b42318' }}>-{moneda(descuentos)}</td>
              </tr>
            </>
          ) : null}
          <tr style={{ borderTop: '2px solid #333' }}>
            <td style={{ ...styles.resumenEtiqueta, fontWeight: 700, fontSize: '16px' }}>Total</td>
            <td style={{ ...styles.resumenValor, fontWeight: 700, fontSize: '16px' }}>{moneda(total)}</td>
          </tr>
          {pagos.map((p) => (
            <tr key={p.medio_pago}>
              <td style={{ ...styles.resumenEtiqueta, color: '#555' }}>Pagado en {String(p.medio_pago).toLowerCase()}</td>
              <td style={{ ...styles.resumenValor, color: '#555' }}>{moneda(p.monto)}</td>
            </tr>
          ))}
          {!pagos.length && venta.medio_pago ? (
            <tr>
              <td style={{ ...styles.resumenEtiqueta, color: '#555' }}>Medio de pago</td>
              <td style={{ ...styles.resumenValor, color: '#555' }}>{venta.medio_pago}</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <p style={{ fontSize: '12px', color: '#555', marginTop: '40px', textAlign: 'center' }}>¡Gracias por tu compra! · geekstore.com.co</p>
    </div>
  );
}

const styles = {
  etiqueta: { fontWeight: 700, padding: '4px 10px 4px 0', width: '90px', verticalAlign: 'top' },
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
