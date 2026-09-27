'use client';

import { useState } from 'react';
import Shell from '../../components/Shell';

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function primerDiaMesISO() {
  return hoyISO().slice(0, 8) + '01';
}

const REPORTES = [
  { id: 'inventario', label: 'Valor de inventario actual' },
  { id: 'ventasItem', label: 'Ventas por ítem' },
  { id: 'ventasVendedor', label: 'Ventas por vendedor' },
];

// Antes, apenas se entraba a esta pantalla, se generaban los tres reportes
// de una sola vez (dos llamadas al servidor) aunque solo se quisiera ver
// uno. Ahora no se genera nada hasta que se elige cuál y se le da
// "Generar" — más rápido para entrar a la pantalla y no gasta consultas de
// más. Inventario y Ventas por ítem comparten la misma consulta al
// servidor (siempre han venido juntas), así que generar una dejar lista la
// otra sin tener que volver a consultar.
export default function ReportesPage() {
  const [reporteActivo, setReporteActivo] = useState(null);
  const [desde, setDesde] = useState(primerDiaMesISO());
  const [hasta, setHasta] = useState(hoyISO());

  const [inventario, setInventario] = useState(null);
  const [ventasPorItem, setVentasPorItem] = useState(null);
  const [ventasPorVendedor, setVentasPorVendedor] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  async function generarInventarioYVentasItem() {
    setCargando(true);
    setError('');
    try {
      const res = await fetch(`/api/reportes?desde=${desde}&hasta=${hasta}`);
      const data = await res.json();
      if (data.ok) {
        setInventario(data.inventario);
        setVentasPorItem(data.ventasPorItem);
      } else {
        setError(data.error || 'No se pudo generar el reporte');
      }
    } catch {
      setError('No se pudo generar el reporte');
    } finally {
      setCargando(false);
    }
  }

  async function generarVentasPorVendedor() {
    setCargando(true);
    setError('');
    try {
      const res = await fetch(`/api/reportes/vendedores?desde=${desde}&hasta=${hasta}`);
      const data = await res.json();
      if (data.ok) {
        setVentasPorVendedor(data.ventasPorVendedor);
      } else {
        setError(data.error || 'No se pudo generar el reporte');
      }
    } catch {
      setError('No se pudo generar el reporte');
    } finally {
      setCargando(false);
    }
  }

  function elegirReporte(id) {
    setReporteActivo(id);
    setError('');
  }

  function generar() {
    if (reporteActivo === 'ventasVendedor') generarVentasPorVendedor();
    else generarInventarioYVentasItem();
  }

  function moneda(n) {
    return `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
  }

  const necesitaFechas = reporteActivo === 'ventasItem' || reporteActivo === 'ventasVendedor';
  const yaGenerado =
    (reporteActivo === 'inventario' && inventario !== null) ||
    (reporteActivo === 'ventasItem' && ventasPorItem !== null) ||
    (reporteActivo === 'ventasVendedor' && ventasPorVendedor !== null);

  const totalCosto = (inventario || []).reduce((acc, p) => acc + Number(p.valor_costo || 0), 0);
  const totalVenta = (inventario || []).reduce((acc, p) => acc + Number(p.valor_venta || 0), 0);
  const totalCostoPrincipal = (inventario || []).reduce((acc, p) => acc + Number(p.valor_costo_principal || 0), 0);
  const totalVentaPrincipal = (inventario || []).reduce((acc, p) => acc + Number(p.valor_venta_principal || 0), 0);
  const totalCostoDistribuidor = (inventario || []).reduce((acc, p) => acc + Number(p.valor_costo_distribuidor || 0), 0);
  const totalVentaDistribuidor = (inventario || []).reduce((acc, p) => acc + Number(p.valor_venta_distribuidor || 0), 0);
  const totalUnidadesVendidas = (ventasPorItem || []).reduce((acc, v) => acc + Number(v.unidades || 0), 0);
  const totalVendido = (ventasPorItem || []).reduce((acc, v) => acc + Number(v.total || 0), 0);

  return (
    <Shell title="Reportes">
      <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
        Elige qué reporte quieres ver y dale &quot;Generar&quot;.
      </p>

      <div style={styles.tabs}>
        {REPORTES.map((r) => (
          <button
            key={r.id}
            onClick={() => elegirReporte(r.id)}
            style={{ ...styles.tab, ...(reporteActivo === r.id ? styles.tabActiva : {}) }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {reporteActivo && (
        <div style={styles.barraGenerar}>
          {necesitaFechas && (
            <>
              <label>
                Desde
                <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={styles.input} />
              </label>
              <label>
                Hasta
                <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={styles.input} />
              </label>
            </>
          )}
          <button onClick={generar} disabled={cargando} style={styles.btnPrimario}>
            {cargando ? 'Generando...' : yaGenerado ? 'Volver a generar' : 'Generar'}
          </button>
        </div>
      )}

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {!reporteActivo && (
        <p style={{ color: 'var(--text-secondary)' }}>Selecciona un reporte arriba para empezar.</p>
      )}

      {reporteActivo === 'inventario' && inventario !== null && (
        <div style={styles.resumenBodegas}>
          <div style={styles.resumenTarjeta}>
            <div style={styles.resumenTitulo}>Bodega Principal</div>
            <div>Costo: <strong>{moneda(totalCostoPrincipal)}</strong></div>
            <div>Venta: <strong>{moneda(totalVentaPrincipal)}</strong></div>
          </div>
          <div style={styles.resumenTarjeta}>
            <div style={styles.resumenTitulo}>Bodega Distribuidor</div>
            <div>Costo: <strong>{moneda(totalCostoDistribuidor)}</strong></div>
            <div>Venta: <strong>{moneda(totalVentaDistribuidor)}</strong></div>
          </div>
          <div style={{ ...styles.resumenTarjeta, ...styles.resumenTarjetaTotal }}>
            <div style={styles.resumenTitulo}>Total global</div>
            <div>Costo: <strong>{moneda(totalCosto)}</strong></div>
            <div>Venta: <strong>{moneda(totalVenta)}</strong></div>
          </div>
        </div>
      )}

      {reporteActivo === 'inventario' && inventario !== null && (
        <div className="pos-tabla-scroll" style={styles.tableCard}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={styles.th}>Referencia</th>
                <th style={styles.th}>Nombre</th>
                <th style={styles.th}>Stock</th>
                <th style={styles.th}>Valor costo</th>
                <th style={styles.th}>Valor venta</th>
              </tr>
            </thead>
            <tbody>
              {inventario.map((p) => (
                <tr key={p.referencia} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={styles.td}>{p.referencia}</td>
                  <td style={styles.td}>{p.nombre}</td>
                  <td style={styles.td}>{p.cantidad}</td>
                  <td style={styles.td}>{moneda(p.valor_costo)}</td>
                  <td style={styles.td}>{moneda(p.valor_venta)}</td>
                </tr>
              ))}
              {inventario.length === 0 && (
                <tr>
                  <td style={styles.td} colSpan={5}>No hay productos activos.</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 'bold' }}>
                <td style={styles.td} colSpan={3}>Total</td>
                <td style={styles.td}>{moneda(totalCosto)}</td>
                <td style={styles.td}>{moneda(totalVenta)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {reporteActivo === 'ventasItem' && ventasPorItem !== null && (
        <div className="pos-tabla-scroll" style={styles.tableCard}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={styles.th}>Referencia</th>
                <th style={styles.th}>Nombre</th>
                <th style={styles.th}>Unidades vendidas</th>
                <th style={styles.th}>Total vendido</th>
              </tr>
            </thead>
            <tbody>
              {ventasPorItem.map((v) => (
                <tr key={v.referencia} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={styles.td}>{v.referencia}</td>
                  <td style={styles.td}>{v.nombre}</td>
                  <td style={styles.td}>{v.unidades}</td>
                  <td style={styles.td}>{moneda(v.total)}</td>
                </tr>
              ))}
              {ventasPorItem.length === 0 && (
                <tr>
                  <td style={styles.td} colSpan={4}>Sin ventas en ese rango.</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 'bold' }}>
                <td style={styles.td} colSpan={2}>Total</td>
                <td style={styles.td}>{totalUnidadesVendidas}</td>
                <td style={styles.td}>{moneda(totalVendido)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {reporteActivo === 'ventasVendedor' && ventasPorVendedor !== null && (
        <div className="pos-tabla-scroll" style={styles.tableCard}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={styles.th}>Vendedor</th>
                <th style={styles.th}>Cantidad de ventas</th>
                <th style={styles.th}>Unidades vendidas</th>
                <th style={styles.th}>Total vendido</th>
                <th style={styles.th}>Ticket promedio</th>
              </tr>
            </thead>
            <tbody>
              {ventasPorVendedor.map((v) => (
                <tr key={v.vendedor_nombre} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={styles.td}>{v.vendedor_nombre}</td>
                  <td style={styles.td}>{v.cantidad_ventas}</td>
                  <td style={styles.td}>{v.unidades_vendidas}</td>
                  <td style={styles.td}>{moneda(v.total_vendido)}</td>
                  <td style={styles.td}>{moneda(Number(v.total_vendido) / Number(v.cantidad_ventas))}</td>
                </tr>
              ))}
              {ventasPorVendedor.length === 0 && (
                <tr>
                  <td style={styles.td} colSpan={5}>Sin ventas en ese rango.</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 'bold' }}>
                <td style={styles.td} colSpan={3}>Total</td>
                <td style={styles.td}>
                  {moneda(ventasPorVendedor.reduce((acc, v) => acc + Number(v.total_vendido || 0), 0))}
                </td>
                <td style={styles.td}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Shell>
  );
}

const styles = {
  resumenBodegas: { display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' },
  resumenTarjeta: {
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '12px 16px',
    minWidth: '200px',
    flex: '1 1 200px',
    fontSize: '14px',
  },
  resumenTarjetaTotal: { borderColor: 'var(--teal)', borderWidth: '2px' },
  resumenTitulo: { fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' },
  tabs: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' },
  tab: {
    padding: '9px 16px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  tabActiva: { background: 'var(--teal)', color: '#fff', borderColor: 'var(--teal)' },
  barraGenerar: { display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '16px', flexWrap: 'wrap' },
  tableCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 16px', marginBottom: '32px' },
  input: { display: 'block', padding: '9px', marginTop: '4px', borderRadius: '8px', border: '1px solid var(--border)' },
  th: { padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)' },
  td: { padding: '10px 8px', fontSize: '14px' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600, height: '38px' },
};
