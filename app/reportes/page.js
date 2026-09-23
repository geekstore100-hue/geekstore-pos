'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function primerDiaMesISO() {
  return hoyISO().slice(0, 8) + '01';
}

export default function ReportesPage() {
  const [desde, setDesde] = useState(primerDiaMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [inventario, setInventario] = useState([]);
  const [ventasPorItem, setVentasPorItem] = useState([]);
  const [ventasPorVendedor, setVentasPorVendedor] = useState([]);
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    setCargando(true);
    const [resReportes, resVendedores] = await Promise.all([
      fetch(`/api/reportes?desde=${desde}&hasta=${hasta}`),
      fetch(`/api/reportes/vendedores?desde=${desde}&hasta=${hasta}`),
    ]);
    const data = await resReportes.json();
    const dataVendedores = await resVendedores.json();
    if (data.ok) {
      setInventario(data.inventario);
      setVentasPorItem(data.ventasPorItem);
    }
    if (dataVendedores.ok) {
      setVentasPorVendedor(dataVendedores.ventasPorVendedor);
    }
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function moneda(n) {
    return `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
  }

  const totalCosto = inventario.reduce((acc, p) => acc + Number(p.valor_costo || 0), 0);
  const totalVenta = inventario.reduce((acc, p) => acc + Number(p.valor_venta || 0), 0);
  const totalUnidadesVendidas = ventasPorItem.reduce((acc, v) => acc + Number(v.unidades || 0), 0);
  const totalVendido = ventasPorItem.reduce((acc, v) => acc + Number(v.total || 0), 0);

  return (
    <Shell title="Reportes">
      <h3 style={{ marginTop: 0 }}>Valor de inventario actual</h3>
      <div style={styles.tableCard}>
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
            {inventario.length === 0 && !cargando && (
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

      <h3>Ventas por ítem</h3>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '16px' }}>
        <label>
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={styles.input} />
        </label>
        <label>
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={styles.input} />
        </label>
        <button onClick={cargar} style={styles.btnPrimario}>Consultar</button>
      </div>

      <div style={styles.tableCard}>
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
            {ventasPorItem.length === 0 && !cargando && (
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

      <h3>Ventas por vendedor</h3>
      <div style={styles.tableCard}>
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
            {ventasPorVendedor.length === 0 && !cargando && (
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
    </Shell>
  );
}

const styles = {
  tableCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 16px', marginBottom: '32px' },
  input: { display: 'block', padding: '9px', marginTop: '4px', borderRadius: '8px', border: '1px solid var(--border)' },
  th: { padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)' },
  td: { padding: '10px 8px', fontSize: '14px' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600, height: '38px' },
};
