'use client';

import { useState } from 'react';
import Shell from '../../components/Shell';
import { armarJournal, exportarJournalExcel } from '../../lib/journalVentas';

// Fecha de HOY en hora de Colombia (AAAA-MM-DD). Antes usaba
// toISOString(), que da la fecha en hora UTC (5 horas adelante): después de
// las 7:00 p. m. ya daba la fecha de MAÑANA, y la vista de "hoy" salía vacía.
function hoyISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}
function primerDiaMesISO() {
  return hoyISO().slice(0, 8) + '01';
}

const REPORTES = [
  { id: 'inventario', label: 'Valor de inventario actual' },
  { id: 'ventasItem', label: 'Ventas por ítem' },
  { id: 'ventasVendedor', label: 'Ventas por vendedor' },
  { id: 'journal', label: '📒 Journal de ventas (Excel)' },
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
  const [journal, setJournal] = useState(null);
  const [conAnuladas, setConAnuladas] = useState(false);
  const [exportando, setExportando] = useState(false);
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

  // Journal de ventas (octubre 2026): todas las ventas línea por línea, con
  // resumen y exportación a Excel (ver lib/journalVentas.js).
  async function generarJournal() {
    setCargando(true);
    setError('');
    try {
      const res = await fetch(`/api/reportes/journal?desde=${desde}&hasta=${hasta}${conAnuladas ? '&anuladas=1' : ''}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo generar el reporte');
      setJournal({ ...armarJournal(data), desde: data.desde, hasta: data.hasta });
    } catch (e) {
      setError(e.message || 'No se pudo generar el reporte');
    } finally {
      setCargando(false);
    }
  }

  async function exportarJournal() {
    if (!journal) return;
    setExportando(true);
    try {
      await exportarJournalExcel(journal, { desde: journal.desde, hasta: journal.hasta });
    } catch (e) {
      setError(`No se pudo crear el Excel: ${e.message}`);
    } finally {
      setExportando(false);
    }
  }

  function generar() {
    if (reporteActivo === 'journal') generarJournal();
    else if (reporteActivo === 'ventasVendedor') generarVentasPorVendedor();
    else generarInventarioYVentasItem();
  }

  function moneda(n) {
    return `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
  }

  const necesitaFechas = reporteActivo === 'ventasItem' || reporteActivo === 'ventasVendedor' || reporteActivo === 'journal';
  const yaGenerado =
    (reporteActivo === 'inventario' && inventario !== null) ||
    (reporteActivo === 'ventasItem' && ventasPorItem !== null) ||
    (reporteActivo === 'ventasVendedor' && ventasPorVendedor !== null) ||
    (reporteActivo === 'journal' && journal !== null);

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
          {reporteActivo === 'journal' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', height: '38px' }}>
              <input type="checkbox" checked={conAnuladas} onChange={(e) => setConAnuladas(e.target.checked)} />
              Incluir anuladas (marcadas, no suman)
            </label>
          )}
          <button onClick={generar} disabled={cargando} style={styles.btnPrimario}>
            {cargando ? 'Generando...' : yaGenerado ? 'Volver a generar' : 'Generar'}
          </button>
          {reporteActivo === 'journal' && journal && (
            <button onClick={exportarJournal} disabled={exportando} style={{ ...styles.btnPrimario, background: '#1d6f42' }}>
              {exportando ? 'Creando Excel...' : '⬇️ Exportar a Excel'}
            </button>
          )}
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
      {reporteActivo === 'journal' && journal !== null && (
        <>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
            Del {journal.desde} al {journal.hasta}. El costo es el del día de cada venta.
          </p>
          <div style={styles.resumenBodegas}>
            <div style={{ ...styles.resumenTarjeta, ...styles.resumenTarjetaTotal }}>
              <div style={styles.resumenTitulo}>Neto (después de devoluciones)</div>
              <div style={{ fontSize: '22px', fontWeight: 800 }}>{moneda(journal.resumen.netoFinal)}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {journal.resumen.ventas} ventas · {journal.resumen.unidades} unidades · ticket {moneda(journal.resumen.ticket)}
              </div>
            </div>
            <div style={styles.resumenTarjeta}>
              <div style={styles.resumenTitulo}>Ventas</div>
              <div>Brutas: <strong>{moneda(journal.resumen.bruto)}</strong></div>
              <div>Descuentos: <strong>-{moneda(journal.resumen.descuento)}</strong></div>
              <div>Devoluciones: <strong>-{moneda(journal.resumen.devoluciones)}</strong></div>
            </div>
            <div style={styles.resumenTarjeta}>
              <div style={styles.resumenTitulo}>Utilidad</div>
              <div>Costo: <strong>{moneda(journal.resumen.costo)}</strong></div>
              <div>Utilidad: <strong>{moneda(journal.resumen.utilidad)}</strong></div>
              <div>Margen: <strong>{(journal.resumen.margen * 100).toFixed(1)}%</strong></div>
            </div>
            {journal.porBodega.map((b) => (
              <div key={b.clave} style={styles.resumenTarjeta}>
                <div style={styles.resumenTitulo}>Vendido de {b.clave}</div>
                <div>Venta: <strong>{moneda(b.total)}</strong></div>
                <div>Costo: <strong>{moneda(b.costo)}</strong></div>
                <div>Ganancia: <strong>{moneda(b.utilidad)}</strong>{b.total > 0 ? ` (${((b.utilidad / b.total) * 100).toFixed(1)}%)` : ''}</div>
              </div>
            ))}
            <div style={styles.resumenTarjeta}>
              <div style={styles.resumenTitulo}>Por medio de pago</div>
              {journal.porMedio.length === 0 && <div>—</div>}
              {journal.porMedio.map((m) => (
                <div key={m.medio}>{m.medio}: <strong>{moneda(m.total)}</strong></div>
              ))}
              {journal.resumen.anuladas > 0 && (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{journal.resumen.anuladas} anulada(s), no suman</div>
              )}
            </div>
          </div>

          <div className="pos-tabla-scroll" style={styles.tableCard}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                  <th style={styles.th}>Fecha</th>
                  <th style={styles.th}>Venta</th>
                  <th style={styles.th}>Vendedor</th>
                  <th style={styles.th}>Producto</th>
                  <th style={styles.th}>Cant.</th>
                  <th style={styles.th}>Precio</th>
                  <th style={styles.th}>Desc.</th>
                  <th style={styles.th}>Total</th>
                  <th style={styles.th}>Pago</th>
                </tr>
              </thead>
              <tbody>
                {journal.lineas.slice(0, 300).map((l, i) => (
                  <tr key={`${l.venta_id}-${i}`} style={{ borderBottom: '1px solid var(--border)', ...(l.anulada ? { opacity: 0.5, textDecoration: 'line-through' } : {}) }}>
                    <td style={styles.td}>{l.fecha} {l.hora}</td>
                    <td style={styles.td}>
                      #{l.venta_id}
                      {l.canal !== 'Mostrador' && <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{l.canal}</div>}
                    </td>
                    <td style={styles.td}>{l.vendedor}</td>
                    <td style={styles.td}>
                      {l.producto}
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Ref. {l.referencia} · {l.categoria}</div>
                    </td>
                    <td style={styles.td}>{l.cantidad}</td>
                    <td style={styles.td}>{moneda(l.precio_neto)}</td>
                    <td style={styles.td}>{l.descuento_pct ? `${l.descuento_pct}%` : '—'}</td>
                    <td style={styles.td}><strong>{moneda(l.total)}</strong></td>
                    <td style={styles.td}>{l.medio_pago}</td>
                  </tr>
                ))}
                {journal.devoluciones.map((d) => (
                  <tr key={`dev-${d.id}`} style={{ borderBottom: '1px solid var(--border)', color: 'var(--danger, #c0392b)' }}>
                    <td style={styles.td}>{d.fecha} {d.hora}</td>
                    <td style={styles.td}>Devolución</td>
                    <td style={styles.td}>—</td>
                    <td style={styles.td}>{d.producto}{d.motivo ? <div style={{ fontSize: '11px' }}>{d.motivo}</div> : null}</td>
                    <td style={styles.td}>-{d.cantidad}</td>
                    <td style={styles.td}></td>
                    <td style={styles.td}></td>
                    <td style={styles.td}><strong>-{moneda(d.monto)}</strong></td>
                    <td style={styles.td}>Efectivo</td>
                  </tr>
                ))}
                {journal.lineas.length === 0 && journal.devoluciones.length === 0 && (
                  <tr>
                    <td style={styles.td} colSpan={9}>Sin ventas en ese rango.</td>
                  </tr>
                )}
              </tbody>
            </table>
            {journal.lineas.length > 300 && (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Aquí se ven las primeras 300 líneas de {journal.lineas.length}. El Excel trae todas.
              </p>
            )}
          </div>
        </>
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
