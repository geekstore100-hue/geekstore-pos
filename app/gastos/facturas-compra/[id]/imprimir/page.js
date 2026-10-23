'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

// Factura de compra imprimible (octubre 2026): botón "🖨️ Imprimir" en la
// lista de Facturas de compra y en el detalle de cada factura. Igual que el
// ajuste de inventario imprimible: página aparte, sin el menú del sistema,
// que abre la ventana de impresión sola (desde ahí también se puede
// "Guardar como PDF").
export default function ImprimirFacturaCompraPage() {
  const params = useParams();
  const [datos, setDatos] = useState(null);
  const [empresa, setEmpresa] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    async function cargar() {
      const [res, resEmpresa] = await Promise.all([
        fetch(`/api/facturas-compra/${params.id}`),
        fetch('/api/configuracion/datos-empresa').catch(() => null),
      ]);
      const data = await res.json().catch(() => ({}));
      const dataEmpresa = resEmpresa ? await resEmpresa.json().catch(() => ({})) : {};
      if (dataEmpresa?.ok) setEmpresa(dataEmpresa);
      if (data.ok) {
        setDatos(data);
        setTimeout(() => window.print(), 400);
      } else {
        setError(data.error || 'No se pudo cargar la factura');
      }
    }
    cargar();
  }, [params.id]);

  function moneda(n) {
    return Math.round(Number(n || 0)).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  }

  function numero(n) {
    return Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 });
  }

  function fecha(valor) {
    if (!valor) return '—';
    const texto = String(valor);
    // Fechas guardadas como AAAA-MM-DD: se muestran tal cual (sin correrlas por zona horaria).
    const m = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m && texto.length <= 10) return `${m[3]}/${m[2]}/${m[1]}`;
    // Igual que la lista de facturas de compra (misma fecha que se ve allá).
    return new Date(valor).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  if (error) {
    return <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif' }}>{error}</div>;
  }
  if (!datos) {
    return <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif' }}>Cargando...</div>;
  }

  const { factura, items } = datos;
  const subtotalLinea = (it) =>
    Number(it.cantidad) * Number(it.precio_unitario) * (1 - (Number(it.descuento_porcentaje) || 0) / 100);
  const hayDescuentos = items.some((it) => Number(it.descuento_porcentaje) > 0);
  const unidades = items.reduce((a, it) => a + Number(it.cantidad || 0), 0);
  const conRetencion = Number(factura.retencion_valor) > 0;

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
          <h2 style={{ margin: '0 0 2px' }}>Factura de compra {factura.numero || `FC-${factura.id}`}</h2>
          <p style={{ color: '#555', margin: 0 }}>Registro interno #{factura.id}</p>
        </div>
        <div style={{ textAlign: 'right', fontSize: '13px', color: '#333' }}>
          <strong>{empresa.razonSocial || 'Geek Store'}</strong>
          {empresa.nit ? <div>NIT {empresa.nit}</div> : null}
          {empresa.direccion ? <div>{empresa.direccion}</div> : null}
          {empresa.ciudad || empresa.telefono ? <div>{[empresa.ciudad, empresa.telefono].filter(Boolean).join(' · ')}</div> : null}
        </div>
      </div>

      <table style={{ width: '100%', marginBottom: '20px', fontSize: '14px' }}>
        <tbody>
          <tr>
            <td style={styles.etiqueta}>Proveedor:</td>
            <td>
              {factura.proveedor_nombre}
              {factura.proveedor_identificacion ? ` — ${factura.proveedor_identificacion}` : ''}
              {factura.proveedor_telefono ? ` · Tel. ${factura.proveedor_telefono}` : ''}
            </td>
          </tr>
          <tr>
            <td style={styles.etiqueta}>Bodega que recibe:</td>
            <td>{factura.bodega_nombre}</td>
          </tr>
          <tr>
            <td style={styles.etiqueta}>Fecha:</td>
            <td>
              {fecha(factura.fecha_creacion)}
              {factura.fecha_vencimiento ? ` · Vence: ${fecha(factura.fecha_vencimiento)}` : ''}
            </td>
          </tr>
          <tr>
            <td style={styles.etiqueta}>Estado:</td>
            <td>
              {factura.estado_pago === 'pagada' ? `Pagada${factura.pagado_en ? ` el ${fecha(factura.pagado_en)}` : ''}` : 'Pendiente de pago'}
            </td>
          </tr>
          {factura.notas ? (
            <tr>
              <td style={styles.etiqueta}>Notas:</td>
              <td style={{ whiteSpace: 'pre-line' }}>{factura.notas}</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #333' }}>
            <th style={styles.th}>Referencia</th>
            <th style={styles.th}>Producto</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Cantidad</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Precio</th>
            {hayDescuentos ? <th style={{ ...styles.th, textAlign: 'right' }}>Desc.</th> : null}
            <th style={{ ...styles.th, textAlign: 'right' }}>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={`${it.producto_id}-${i}`} style={{ borderBottom: '1px solid #ccc' }}>
              <td style={styles.td}>{it.referencia}</td>
              <td style={styles.td}>{it.nombre}</td>
              <td style={{ ...styles.td, textAlign: 'right' }}>{numero(it.cantidad)}</td>
              <td style={{ ...styles.td, textAlign: 'right' }}>{moneda(it.precio_unitario)}</td>
              {hayDescuentos ? (
                <td style={{ ...styles.td, textAlign: 'right' }}>{Number(it.descuento_porcentaje) > 0 ? `${numero(it.descuento_porcentaje)}%` : '—'}</td>
              ) : null}
              <td style={{ ...styles.td, textAlign: 'right' }}>{moneda(subtotalLinea(it))}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td style={styles.td} colSpan={hayDescuentos ? 6 : 5}>Esta factura no tiene productos.</td>
            </tr>
          )}
        </tbody>
      </table>
      <p style={{ fontSize: '12px', color: '#555', margin: '6px 0 0' }}>
        {items.length} producto{items.length === 1 ? '' : 's'} · {numero(unidades)} unidad{unidades === 1 ? '' : 'es'}
      </p>

      <table style={{ marginLeft: 'auto', marginTop: '14px', fontSize: '14px', minWidth: '300px' }}>
        <tbody>
          <tr>
            <td style={styles.resumenEtiqueta}>Subtotal</td>
            <td style={styles.resumenValor}>{moneda(factura.subtotal)}</td>
          </tr>
          <tr>
            <td style={{ ...styles.resumenEtiqueta, fontWeight: 700 }}>Total</td>
            <td style={{ ...styles.resumenValor, fontWeight: 700 }}>{moneda(factura.total)}</td>
          </tr>
          {conRetencion ? (
            <tr>
              <td style={styles.resumenEtiqueta}>
                Retención ReteICA {numero(factura.retencion_porcentaje)}%
                {Number(factura.retencion_base) > 0 ? ` (base ${moneda(factura.retencion_base)})` : ''}
              </td>
              <td style={{ ...styles.resumenValor, color: '#b42318' }}>-{moneda(factura.retencion_valor)}</td>
            </tr>
          ) : null}
          <tr style={{ borderTop: '2px solid #333' }}>
            <td style={{ ...styles.resumenEtiqueta, fontWeight: 700, fontSize: '16px' }}>Por pagar al proveedor</td>
            <td style={{ ...styles.resumenValor, fontWeight: 700, fontSize: '16px' }}>{moneda(factura.por_pagar)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '70px' }}>
        <div style={{ textAlign: 'center', width: '45%' }}>
          <div style={{ borderTop: '1px solid #333', paddingTop: '6px' }}>Recibido por</div>
        </div>
        <div style={{ textAlign: 'center', width: '45%' }}>
          <div style={{ borderTop: '1px solid #333', paddingTop: '6px' }}>Revisado por</div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  etiqueta: { fontWeight: 700, padding: '4px 10px 4px 0', width: '150px', verticalAlign: 'top' },
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
