'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function primerDiaMesISO() {
  return hoyISO().slice(0, 8) + '01';
}

function moneda(n) {
  return `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
}

// Certificado de retención de ReteICA para un proveedor, por período. Es el
// primer paso simple del módulo: se elige proveedor + fechas, se ve el
// detalle en pantalla y se descarga como PDF (con jsPDF, en el navegador).
// Más adelante se puede sumar el envío automático por correo — por ahora
// Nelson lo descarga y lo envía él mismo.
export default function ReteicaPage() {
  const [proveedores, setProveedores] = useState([]);
  const [proveedorId, setProveedorId] = useState('');
  const [desde, setDesde] = useState(primerDiaMesISO());
  const [hasta, setHasta] = useState(hoyISO());

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [generandoPdf, setGenerandoPdf] = useState(false);

  const [empresaConfigurada, setEmpresaConfigurada] = useState(true);

  useEffect(() => {
    fetch('/api/proveedores')
      .then((r) => r.json())
      .then((d) => { if (d.ok) setProveedores(d.proveedores); });
    fetch('/api/configuracion/datos-empresa')
      .then((r) => r.json())
      .then((d) => { if (d.ok) setEmpresaConfigurada(Boolean(d.razonSocial && d.nit)); });
  }, []);

  async function consultar(e) {
    e.preventDefault();
    setError('');
    setDatos(null);
    if (!proveedorId) {
      setError('Selecciona el proveedor');
      return;
    }
    setCargando(true);
    try {
      const res = await fetch(`/api/reteica/certificado?proveedor_id=${proveedorId}&desde=${desde}&hasta=${hasta}`);
      const data = await res.json();
      if (data.ok) {
        setDatos(data);
      } else {
        setError(data.error || 'No se pudo consultar');
      }
    } catch {
      setError('Error de conexión al consultar');
    } finally {
      setCargando(false);
    }
  }

  async function descargarPdf() {
    if (!datos) return;
    setGenerandoPdf(true);
    setError('');
    try {
      const { generarPdfCertificadoReteica } = await import('../../lib/certificadoReteicaPdf');
      generarPdfCertificadoReteica(datos);
    } catch {
      setError('No se pudo generar el PDF');
    } finally {
      setGenerandoPdf(false);
    }
  }

  return (
    <Shell title="Certificados ReteICA">
      <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
        Genera el certificado de retención en la fuente por ICA de un proveedor, para un período de fechas, con las
        facturas de compra que tuvieron retención practicada. Se descarga como PDF para que lo envíes tú al
        proveedor (por ahora no se envía por correo automáticamente).
      </p>

      {!empresaConfigurada && (
        <p style={{ background: '#fff4e5', border: '1px solid #f5c377', borderRadius: '8px', padding: '10px 14px', color: '#8a5a00' }}>
          Todavía no has puesto la razón social y el NIT de Geek Store en Configuraciones &gt; Datos de la empresa.
          El certificado se puede generar igual, pero va a salir con esos datos en blanco.
        </p>
      )}

      <form onSubmit={consultar} style={styles.barra}>
        <label>
          Proveedor
          <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} style={styles.input}>
            <option value="">Selecciona...</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </label>
        <label>
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={styles.input} />
        </label>
        <label>
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={styles.input} />
        </label>
        <button type="submit" disabled={cargando} style={styles.btnPrimario}>
          {cargando ? 'Consultando...' : 'Consultar'}
        </button>
      </form>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {datos && (
        <div style={styles.tableCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <strong>{datos.proveedor.nombre}</strong>
              {datos.proveedor.identificacion && (
                <span style={{ color: 'var(--text-secondary)' }}> — {datos.proveedor.identificacion}</span>
              )}
            </div>
            <button onClick={descargarPdf} disabled={generandoPdf} style={styles.btnPrimario}>
              {generandoPdf ? 'Generando...' : '⬇ Descargar certificado (PDF)'}
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={styles.th}>Fecha</th>
                <th style={styles.th}>N.° factura</th>
                <th style={styles.th}>Base retención</th>
                <th style={styles.th}>Tarifa</th>
                <th style={styles.th}>Valor retenido</th>
              </tr>
            </thead>
            <tbody>
              {datos.facturas.map((f) => (
                <tr key={f.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={styles.td}>{String(f.fecha_creacion).slice(0, 10)}</td>
                  <td style={styles.td}>{f.numero || `#${f.id}`}</td>
                  <td style={styles.td}>{moneda(f.retencion_base)}</td>
                  <td style={styles.td}>{Number(f.retencion_porcentaje).toLocaleString('es-CO', { maximumFractionDigits: 2 })}%</td>
                  <td style={styles.td}>{moneda(f.retencion_valor)}</td>
                </tr>
              ))}
              {datos.facturas.length === 0 && (
                <tr>
                  <td style={styles.td} colSpan={5}>No hay facturas con retención de este proveedor en ese período.</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 'bold' }}>
                <td style={styles.td} colSpan={4}>Total retenido</td>
                <td style={styles.td}>{moneda(datos.totales.retenido)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Shell>
  );
}

const styles = {
  barra: { display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '16px', flexWrap: 'wrap' },
  tableCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: '32px' },
  input: { display: 'block', padding: '9px', marginTop: '4px', borderRadius: '8px', border: '1px solid var(--border)', minWidth: '160px' },
  th: { padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)' },
  td: { padding: '10px 8px', fontSize: '14px' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600, height: '38px' },
};
