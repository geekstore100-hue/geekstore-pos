'use client';

// Comprobante de egreso (nov 2026) — Gastos del negocio (lib/gastos.js).
// Hoja carta, sin el menú del sistema; abre la ventana de impresión sola
// (desde ahí también se puede "Guardar como PDF").

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { valorEnLetras } from '../../../../lib/valorEnLetras';

function moneda(n) {
  return `$ ${Math.round(Number(n || 0)).toLocaleString('es-CO')}`;
}
function fechaLarga(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '—';
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${Number(m[3])} de ${meses[Number(m[2]) - 1]} de ${m[1]}`;
}

export default function ImprimirGastoPage() {
  const params = useParams();
  const [gasto, setGasto] = useState(null);
  const [empresa, setEmpresa] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    async function cargar() {
      const [res, resEmpresa] = await Promise.all([
        fetch(`/api/gastos/${params.id}`),
        fetch('/api/configuracion/datos-empresa').catch(() => null),
      ]);
      const data = await res.json().catch(() => ({}));
      const dataEmpresa = resEmpresa ? await resEmpresa.json().catch(() => ({})) : {};
      if (dataEmpresa?.ok) setEmpresa(dataEmpresa);
      if (data.ok) {
        setGasto(data.gasto);
        setTimeout(() => window.print(), 400);
      } else {
        setError(data.error || 'No se pudo cargar el gasto');
      }
    }
    cargar();
  }, [params.id]);

  if (error) return <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif' }}>{error}</div>;
  if (!gasto) return <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif' }}>Cargando...</div>;

  const numero = `CE-${String(gasto.id).padStart(4, '0')}`;
  const formaPago = gasto.de_caja ? `${gasto.medio_pago} (de la caja${gasto.turno_id ? `, turno #${gasto.turno_id}` : ''})` : gasto.medio_pago;

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '30px', maxWidth: '820px', margin: '0 auto', color: '#111', position: 'relative' }}>
      <style>{`
        body { background: #fff !important; }
        @media print {
          @page { size: letter; margin: 15mm; }
          .no-imprimir { display: none; }
        }
        .ce-fila td { padding: 9px 10px; border: 1px solid #999; font-size: 14px; vertical-align: top; }
        .ce-fila td:first-child { width: 170px; background: #f3f3f3; font-weight: 700; }
      `}</style>

      <button className="no-imprimir" onClick={() => window.print()} style={styles.btnImprimir}>
        Imprimir de nuevo
      </button>

      {gasto.anulado ? <div style={styles.marcaAnulado}>ANULADO</div> : null}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '22px' }}>
        <div style={{ fontSize: '13px', color: '#333', lineHeight: 1.5 }}>
          <strong style={{ fontSize: '17px', color: '#111' }}>{empresa.razonSocial || 'Geek Store'}</strong>
          {empresa.nit ? <div>NIT {empresa.nit}</div> : null}
          {empresa.direccion ? <div>{empresa.direccion}</div> : null}
          {empresa.ciudad || empresa.telefono ? <div>{[empresa.ciudad, empresa.telefono].filter(Boolean).join(' · ')}</div> : null}
        </div>
        <div style={{ border: '2px solid #111', borderRadius: '6px', padding: '10px 16px', textAlign: 'center', minWidth: '220px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.04em' }}>COMPROBANTE DE EGRESO</div>
          <div style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0' }}>N.º {numero}</div>
          <div style={{ fontSize: '13px' }}>Fecha: {fechaLarga(gasto.fecha)}</div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr className="ce-fila">
            <td>Pagado a</td>
            <td>{gasto.beneficiario || '—'}</td>
          </tr>
          <tr className="ce-fila">
            <td>NIT / C.C.</td>
            <td>{gasto.beneficiario_doc || '—'}</td>
          </tr>
          <tr className="ce-fila">
            <td>Concepto</td>
            <td>{gasto.concepto}</td>
          </tr>
          <tr className="ce-fila">
            <td>Categoría</td>
            <td>{gasto.categoria}</td>
          </tr>
          <tr className="ce-fila">
            <td>Forma de pago</td>
            <td>{formaPago}</td>
          </tr>
          <tr className="ce-fila">
            <td>Valor</td>
            <td style={{ fontSize: '20px', fontWeight: 700 }}>{moneda(gasto.valor)}</td>
          </tr>
          <tr className="ce-fila">
            <td>La suma de</td>
            <td>{valorEnLetras(gasto.valor).replace(/^./, (c) => c.toUpperCase())}</td>
          </tr>
          {gasto.notas ? (
            <tr className="ce-fila">
              <td>Notas</td>
              <td style={{ whiteSpace: 'pre-line' }}>{gasto.notas}</td>
            </tr>
          ) : null}
          {gasto.anulado ? (
            <tr className="ce-fila">
              <td>Anulado</td>
              <td style={{ color: '#b42318' }}>{gasto.motivo_anulacion || 'Sí'}</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '24px', marginTop: '80px' }}>
        <div style={styles.firma}>
          <div style={styles.lineaFirma}>Elaboró</div>
        </div>
        <div style={styles.firma}>
          <div style={styles.lineaFirma}>Aprobó</div>
        </div>
        <div style={{ ...styles.firma, flex: 1.4 }}>
          <div style={styles.lineaFirma}>
            Recibí conforme
            <div style={{ textAlign: 'left', fontSize: '12px', marginTop: '10px', lineHeight: 2 }}>
              Nombre: ______________________________
              <br />
              C.C. / NIT: ___________________________
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  btnImprimir: { marginBottom: '16px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #ccc', background: '#fff', cursor: 'pointer' },
  firma: { flex: 1, textAlign: 'center' },
  lineaFirma: { borderTop: '1px solid #333', paddingTop: '6px', fontSize: '13px' },
  marcaAnulado: {
    position: 'absolute',
    top: '260px',
    left: '50%',
    transform: 'translateX(-50%) rotate(-18deg)',
    fontSize: '96px',
    fontWeight: 800,
    color: 'rgba(180, 35, 24, 0.18)',
    border: '8px solid rgba(180, 35, 24, 0.18)',
    padding: '0 24px',
    pointerEvents: 'none',
  },
};
