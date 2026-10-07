'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import RetencionesSinFactura from '../../components/RetencionesSinFactura';
import { opcionesBimestres, nombreBimestre } from '../../lib/bimestres';

// Fecha de HOY en hora de Colombia (AAAA-MM-DD). Antes usaba
// toISOString(), que da la fecha en hora UTC (5 horas adelante): después de
// las 7:00 p. m. ya daba la fecha de MAÑANA, y la vista de "hoy" salía vacía.
function hoyISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}
function haceUnAñoISO() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

function moneda(n) {
  return `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
}

// Las filas vienen de dos fuentes: 'f-12' = factura de compra del POS y
// 'r-5' = retención registrada sin factura (Eve Jeans u otras).
function numeroFactura(f) {
  if (f.numero) return String(f.numero);
  const id = String(f.id);
  return id.startsWith('f-') ? `#${id.slice(2)}` : '—';
}

// Certificado de retención de ReteICA para un proveedor, por período. Al
// entrar se ve de una vez el resumen de TODOS los proveedores que tuvieron
// retención en el último año (sin necesidad de buscar primero); se hace
// clic en uno para ver el detalle de sus facturas y descargar el PDF (con
// jsPDF, en el navegador). Más adelante se puede sumar el envío automático
// por correo — por ahora Nelson lo descarga y lo envía él mismo.
export default function ReteicaPage() {
  const [proveedores, setProveedores] = useState([]);
  const [proveedorId, setProveedorId] = useState('');
  const [desde, setDesde] = useState(haceUnAñoISO());
  const [hasta, setHasta] = useState(hoyISO());

  const [resumen, setResumen] = useState(null);
  // El período que de verdad se consultó (no el que se está escribiendo).
  const [periodo, setPeriodo] = useState({ desde: haceUnAñoISO(), hasta: hoyISO() });
  const [cargandoResumen, setCargandoResumen] = useState(false);
  const [errorResumen, setErrorResumen] = useState('');

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [generandoPdf, setGenerandoPdf] = useState(false);

  const [empresaConfigurada, setEmpresaConfigurada] = useState(true);

  // Bimestres para elegir el período de un clic (ver lib/bimestres.js).
  const [bimestres] = useState(() => opcionesBimestres(hoyISO()));

  useEffect(() => {
    fetch('/api/proveedores')
      .then((r) => r.json())
      .then((d) => { if (d.ok) setProveedores(d.proveedores); });
    fetch('/api/configuracion/datos-empresa')
      .then((r) => r.json())
      .then((d) => { if (d.ok) setEmpresaConfigurada(Boolean(d.razonSocial && d.nit)); });
  }, []);

  async function cargarResumen(desdeParam, hastaParam) {
    setErrorResumen('');
    setCargandoResumen(true);
    setPeriodo({ desde: desdeParam, hasta: hastaParam });
    try {
      const res = await fetch(`/api/reteica/resumen?desde=${desdeParam}&hasta=${hastaParam}`);
      const data = await res.json();
      if (data.ok) {
        setResumen(data);
      } else {
        setResumen(null);
        setErrorResumen(data.error || 'No se pudo cargar el resumen');
      }
    } catch {
      setResumen(null);
      setErrorResumen('Error de conexión al cargar el resumen');
    } finally {
      setCargandoResumen(false);
    }
  }

  // Al entrar a la página se carga solo, con el período por defecto (último
  // año) — sin que Nelson tenga que buscar nada primero.
  useEffect(() => {
    cargarResumen(desde, hasta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function actualizarPeriodo(e) {
    e.preventDefault();
    aplicarPeriodo(desde, hasta);
  }

  // Cambia el período y recarga el resumen y, si hay un certificado
  // abierto, también ese certificado con el período nuevo.
  function aplicarPeriodo(d, h) {
    setDesde(d);
    setHasta(h);
    cargarResumen(d, h);
    if (datos) consultarProveedor(datos.proveedor.id, d, h);
  }

  function elegirBimestre(clave) {
    if (clave === 'anio') return aplicarPeriodo(haceUnAñoISO(), hoyISO());
    const b = bimestres.lista.find((x) => x.clave === clave);
    if (b) aplicarPeriodo(b.desde, b.hasta);
  }

  const claveElegida =
    bimestres.lista.find((b) => b.desde === desde && b.hasta === hasta)?.clave ||
    (desde === haceUnAñoISO() && hasta === hoyISO() ? 'anio' : '');

  async function consultarProveedor(id, desdeParam, hastaParam) {
    setError('');
    setDatos(null);
    setProveedorId(String(id));
    setCargando(true);
    try {
      const res = await fetch(`/api/reteica/certificado?proveedor_id=${id}&desde=${desdeParam}&hasta=${hastaParam}`);
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

  async function consultar(e) {
    e.preventDefault();
    if (!proveedorId) {
      setError('Selecciona el proveedor');
      return;
    }
    consultarProveedor(proveedorId, desde, hasta);
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
        Todas las retenciones de ReteICA que practicas: las de las facturas de compra de Geek Store y las que registras
        abajo sin factura de compra (Eve Jeans). Con el total del período sabes cuánto declarar, y por cada proveedor
        puedes descargar el certificado en PDF para enviárselo tú (por ahora no se envía por correo automáticamente).
      </p>

      {!empresaConfigurada && (
        <p style={{ background: '#fff4e5', border: '1px solid #f5c377', borderRadius: '8px', padding: '10px 14px', color: '#8a5a00' }}>
          Todavía no has puesto la razón social y el NIT de Geek Store en Configuraciones &gt; Datos de la empresa.
          El certificado se puede generar igual, pero va a salir con esos datos en blanco.
        </p>
      )}

      <form onSubmit={actualizarPeriodo} style={styles.barra}>
        <label>
          Período
          <select value={claveElegida} onChange={(e) => elegirBimestre(e.target.value)} style={styles.input}>
            {claveElegida === '' && <option value="">Fechas personalizadas</option>}
            {bimestres.lista.map((b) => (
              <option key={b.clave} value={b.clave}>{b.etiqueta}</option>
            ))}
            <option value="anio">Último año</option>
          </select>
        </label>
        <button type="button" onClick={() => elegirBimestre(bimestres.anterior.clave)} style={{ ...styles.btnSecundario, height: '38px' }}>
          Bimestre anterior
        </button>
        <label>
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={styles.input} />
        </label>
        <label>
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={styles.input} />
        </label>
        <button type="submit" disabled={cargandoResumen} style={styles.btnPrimario}>
          {cargandoResumen ? 'Actualizando...' : 'Actualizar período'}
        </button>
        <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
          Se filtra por la fecha de la factura. Por defecto se muestra el último año.
        </span>
      </form>

      {errorResumen && <p style={{ color: 'var(--danger)' }}>{errorResumen}</p>}

      {resumen && (
        <div style={styles.tableCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <strong>Proveedores con retención en el período</strong>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
              {nombreBimestre(resumen.periodo.desde, resumen.periodo.hasta)
                ? `Bimestre ${nombreBimestre(resumen.periodo.desde, resumen.periodo.hasta)} · `
                : ''}
              {String(resumen.periodo.desde)} a {String(resumen.periodo.hasta)}
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={styles.th}>Proveedor</th>
                <th style={styles.th}>Negocio</th>
                <th style={styles.th}>Identificación</th>
                <th style={styles.th}>Facturas</th>
                <th style={styles.th}>Base retención</th>
                <th style={styles.th}>Valor retenido</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {resumen.proveedores.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={styles.td}>{p.nombre}</td>
                  <td style={styles.td}>{(p.negocios || ['Geek Store']).join(' + ')}</td>
                  <td style={styles.td}>{p.identificacion || '—'}</td>
                  <td style={styles.td}>{p.facturas}</td>
                  <td style={styles.td}>{moneda(p.total_base)}</td>
                  <td style={styles.td}>{moneda(p.total_retenido)}</td>
                  <td style={styles.td}>
                    <button
                      onClick={() => consultarProveedor(p.id, desde, hasta)}
                      disabled={cargando}
                      style={styles.btnSecundario}
                    >
                      Ver certificado
                    </button>
                  </td>
                </tr>
              ))}
              {resumen.proveedores.length === 0 && (
                <tr>
                  <td style={styles.td} colSpan={7}>Ningún proveedor tuvo retención practicada en este período.</td>
                </tr>
              )}
            </tbody>
            {resumen.proveedores.length > 0 && (
              <tfoot>
                {Object.entries(resumen.totales.porNegocio || {}).length > 1 &&
                  Object.entries(resumen.totales.porNegocio).map(([negocio, valor]) => (
                    <tr key={negocio} style={{ color: 'var(--text-secondary)' }}>
                      <td style={styles.td} colSpan={5}>Retenido por {negocio}</td>
                      <td style={styles.td}>{moneda(valor)}</td>
                      <td style={styles.td}></td>
                    </tr>
                  ))}
                <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 'bold' }}>
                  <td style={styles.td} colSpan={5}>Total retenido (a declarar)</td>
                  <td style={styles.td}>{moneda(resumen.totales.retenido)}</td>
                  <td style={styles.td}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <RetencionesSinFactura
        desde={periodo.desde}
        hasta={periodo.hasta}
        proveedores={proveedores}
        setProveedores={setProveedores}
        onCambio={() => {
          cargarResumen(periodo.desde, periodo.hasta);
          if (datos) consultarProveedor(datos.proveedor.id, periodo.desde, periodo.hasta);
        }}
      />

      <form onSubmit={consultar} style={styles.barra}>
        <label>
          Buscar un proveedor puntual
          <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} style={styles.input}>
            <option value="">Selecciona...</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={cargando} style={styles.btnSecundario}>
          {cargando ? 'Consultando...' : 'Ver certificado'}
        </button>
        <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
          Usa el mismo período de arriba — útil si el proveedor no aparece en la tabla de resumen.
        </span>
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
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '2px' }}>
                {nombreBimestre(datos.periodo.desde, datos.periodo.hasta)
                  ? `Bimestre ${nombreBimestre(datos.periodo.desde, datos.periodo.hasta)} (${datos.periodo.desde} a ${datos.periodo.hasta})`
                  : `Período ${datos.periodo.desde} a ${datos.periodo.hasta}`}
              </div>
            </div>
            <button onClick={descargarPdf} disabled={generandoPdf} style={styles.btnPrimario}>
              {generandoPdf ? 'Generando...' : '⬇ Descargar certificado (PDF)'}
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={styles.th}>Fecha</th>
                <th style={styles.th}>Negocio</th>
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
                  <td style={styles.td}>{f.negocio || 'Geek Store'}</td>
                  <td style={styles.td}>{numeroFactura(f)}</td>
                  <td style={styles.td}>{moneda(f.retencion_base)}</td>
                  <td style={styles.td}>{Number(f.retencion_porcentaje).toLocaleString('es-CO', { maximumFractionDigits: 2 })}%</td>
                  <td style={styles.td}>{moneda(f.retencion_valor)}</td>
                </tr>
              ))}
              {datos.facturas.length === 0 && (
                <tr>
                  <td style={styles.td} colSpan={6}>No hay retenciones de este proveedor en ese período.</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 'bold' }}>
                <td style={styles.td} colSpan={5}>Total retenido</td>
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
  btnSecundario: { padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', color: 'var(--text)', cursor: 'pointer', fontWeight: 600 },
};
