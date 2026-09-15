'use client';

import { useEffect, useState } from 'react';

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
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    setCargando(true);
    const res = await fetch(`/api/reportes?desde=${desde}&hasta=${hasta}`);
    const data = await res.json();
    if (data.ok) {
      setInventario(data.inventario);
      setVentasPorItem(data.ventasPorItem);
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
    <main style={{ fontFamily: 'sans-serif', padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>Reportes — Kennedy</h1>
        <a href="/">Inicio</a>
      </div>

      <h2>Valor de inventario actual</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '32px' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
            <th style={th}>Referencia</th>
            <th style={th}>Nombre</th>
            <th style={th}>Stock</th>
            <th style={th}>Valor costo</th>
            <th style={th}>Valor venta</th>
          </tr>
        </thead>
        <tbody>
          {inventario.map((p) => (
            <tr key={p.referencia} style={{ borderBottom: '1px solid #eee' }}>
              <td style={td}>{p.referencia}</td>
              <td style={td}>{p.nombre}</td>
              <td style={td}>{p.cantidad}</td>
              <td style={td}>{moneda(p.valor_costo)}</td>
              <td style={td}>{moneda(p.valor_venta)}</td>
            </tr>
          ))}
          {inventario.length === 0 && !cargando && (
            <tr>
              <td style={td} colSpan={5}>
                No hay productos activos.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #ddd', fontWeight: 'bold' }}>
            <td style={td} colSpan={3}>
              Total
            </td>
            <td style={td}>{moneda(totalCosto)}</td>
            <td style={td}>{moneda(totalVenta)}</td>
          </tr>
        </tfoot>
      </table>

      <h2>Ventas por ítem</h2>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '16px' }}>
        <label>
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={input} />
        </label>
        <label>
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={input} />
        </label>
        <button onClick={cargar} style={btnPrimario}>
          Consultar
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
            <th style={th}>Referencia</th>
            <th style={th}>Nombre</th>
            <th style={th}>Unidades vendidas</th>
            <th style={th}>Total vendido</th>
          </tr>
        </thead>
        <tbody>
          {ventasPorItem.map((v) => (
            <tr key={v.referencia} style={{ borderBottom: '1px solid #eee' }}>
              <td style={td}>{v.referencia}</td>
              <td style={td}>{v.nombre}</td>
              <td style={td}>{v.unidades}</td>
              <td style={td}>{moneda(v.total)}</td>
            </tr>
          ))}
          {ventasPorItem.length === 0 && !cargando && (
            <tr>
              <td style={td} colSpan={4}>
                Sin ventas en ese rango.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #ddd', fontWeight: 'bold' }}>
            <td style={td} colSpan={2}>
              Total
            </td>
            <td style={td}>{totalUnidadesVendidas}</td>
            <td style={td}>{moneda(totalVendido)}</td>
          </tr>
        </tfoot>
      </table>
    </main>
  );
}

const input = { display: 'block', padding: '8px', marginTop: '4px', borderRadius: '6px', border: '1px solid #ccc' };
const th = { padding: '8px', fontSize: '14px', color: '#555' };
const td = { padding: '8px', fontSize: '14px' };
const btnPrimario = { padding: '8px 14px', borderRadius: '6px', border: 'none', background: '#111', color: '#fff', cursor: 'pointer', height: '38px' };
