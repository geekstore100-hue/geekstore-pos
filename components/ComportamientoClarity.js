'use client';

import { useEffect, useState } from 'react';

// POS → Analíticas → "Comportamiento (Clarity)" (octubre 2026).
// Resumen de Microsoft Clarity (lib/clarity.js) + botones para ver las
// grabaciones, los mapas de calor y los errores en clarity.microsoft.com.
//
// La API de Clarity no documenta los nombres exactos de todos sus datos, así
// que se muestran tal como llegan, traducidos cuando se conoce el nombre.

const METRICAS = {
  traffic: 'Tráfico',
  scrolldepth: 'Hasta dónde bajan en la página',
  engagementtime: 'Tiempo de interacción',
  popularpages: 'Páginas más vistas',
  browser: 'Navegador',
  device: 'Dispositivo',
  os: 'Sistema operativo',
  'country/region': 'País',
  countryregion: 'País',
  pagetitle: 'Título de página',
  referrerurl: 'De dónde llegan',
  deadclickcount: 'Clics muertos (tocan algo que no hace nada)',
  excessivescroll: 'Desplazamiento excesivo (buscan y no encuentran)',
  rageclickcount: 'Clics de rabia (tocan muchas veces seguidas)',
  quickbackclick: 'Regresos rápidos (entran y se devuelven)',
  scripterrorcount: 'Errores de la página (JavaScript)',
  errorclickcount: 'Clics que dieron error',
};

const CAMPOS = {
  totalsessioncount: 'Sesiones',
  totalbotsessioncount: 'Sesiones de robots',
  distantusercount: 'Visitantes',
  pagespersessionpercentage: 'Páginas por sesión',
  sessionscount: 'Sesiones',
  sessionswithmetricpercentage: '% de sesiones',
  sessionswithoutmetricpercentage: '% sin el problema',
  pagesviews: 'Vistas',
  pageviews: 'Vistas',
  subtotal: 'Total',
  averagescrolldepth: 'Profundidad promedio (%)',
  totaltime: 'Tiempo total (s)',
  activetime: 'Tiempo activo (s)',
  url: 'Página',
  name: 'Nombre',
  visitscount: 'Visitas',
};

const clave = (t) => String(t || '').replace(/\s+/g, '').toLowerCase();
const nombreMetrica = (m) => METRICAS[clave(m)] || m;
const nombreCampo = (c) => CAMPOS[clave(c)] || c;

function valorBonito(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (typeof v !== 'boolean' && String(v).trim() !== '' && Number.isFinite(n)) {
    return Number.isInteger(n) ? n.toLocaleString('es-CO') : n.toLocaleString('es-CO', { maximumFractionDigits: 2 });
  }
  const s = String(v);
  return s.length > 70 ? `${s.slice(0, 67)}…` : s;
}

function Tile({ titulo, valor }) {
  return (
    <div style={s.tile}>
      <div style={s.tileValor}>{valor}</div>
      <div style={s.tileTitulo}>{titulo}</div>
    </div>
  );
}

export default function ComportamientoClarity() {
  const [dias, setDias] = useState(1);
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);

  async function cargar(forzar = false) {
    setCargando(true);
    try {
      const r = await fetch(`/api/analiticas/clarity?dias=${dias}${forzar ? '&forzar=1' : ''}`);
      setData(await r.json());
    } catch {
      setData({ ok: false, error: 'Error de conexión' });
    }
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias]);

  const proyecto = data?.proyecto || 'z229bsjzf0';
  const base = `https://clarity.microsoft.com/projects/view/${proyecto}`;
  const metricas = Array.isArray(data?.datos) ? data.datos : [];
  const trafico = metricas.find((m) => clave(m.metricName) === 'traffic');
  const filasTrafico = Array.isArray(trafico?.information) ? trafico.information : [];
  const sumar = (campo) => filasTrafico.reduce((a, f) => a + (Number(f[campo]) || 0), 0);
  const otras = metricas.filter((m) => m !== trafico && Array.isArray(m.information) && m.information.length);

  return (
    <div>
      <div style={s.card}>
        <h3 style={{ marginTop: 0 }}>Cómo navegan los clientes en geekstore.com.co</h3>
        <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)', fontSize: '14px' }}>
          Las grabaciones (videos de cada visita), los mapas de calor y los errores se ven en Microsoft Clarity. Se abren en
          otra pestaña.
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <a href={`${base}/impressions`} target="_blank" rel="noopener noreferrer" style={s.btnPrimario}>
            🎥 Ver grabaciones
          </a>
          <a href={`${base}/heatmaps`} target="_blank" rel="noopener noreferrer" style={s.btn}>
            🔥 Mapas de calor
          </a>
          <a href={`${base}/dashboard`} target="_blank" rel="noopener noreferrer" style={s.btn}>
            📊 Panel de Clarity
          </a>
        </div>
        <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: '12px' }}>
          Tip: en Grabaciones usa los filtros para ver solo las visitas con <strong>errores de JavaScript</strong>, con{' '}
          <strong>clics de rabia</strong>, o las que buscaron algo (etiqueta <strong>busqueda</strong> o{' '}
          <strong>busqueda_sin_resultados</strong>).
        </p>
      </div>

      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <h3 style={{ margin: 0 }}>Resumen</h3>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {[
              [1, 'Últimas 24 h'],
              [3, 'Últimos 3 días'],
            ].map(([n, t]) => (
              <button key={n} type="button" onClick={() => setDias(n)} style={{ ...s.btnChico, ...(dias === n ? s.btnChicoActivo : {}) }}>
                {t}
              </button>
            ))}
            <button type="button" onClick={() => cargar(true)} disabled={cargando} style={s.btnChico} title="Clarity permite pocas consultas al día">
              ↻
            </button>
          </div>
        </div>

        {cargando ? (
          <p style={{ margin: 0 }}>Cargando…</p>
        ) : data?.sinToken ? (
          <p style={{ margin: 0, fontSize: '14px' }}>
            Para ver el resumen aquí, crea en Clarity un token (<strong>Configuración → Exportación de datos → Generar nuevo token de API</strong>) y
            ponlo en Netlify (sitio del POS) como <code>CLARITY_API_TOKEN</code>. Los botones de arriba funcionan sin eso.
          </p>
        ) : !data?.ok ? (
          <p style={{ margin: 0, color: '#c0392b' }}>{data?.error || 'No se pudo cargar'}</p>
        ) : (
          <>
            {data.aviso ? <p style={{ margin: '0 0 10px', color: '#b54708', fontSize: '13px' }}>{data.aviso}</p> : null}
            {filasTrafico.length ? (
              <div style={s.tiles}>
                <Tile titulo="Sesiones" valor={valorBonito(sumar('totalSessionCount'))} />
                <Tile titulo="Visitantes" valor={valorBonito(sumar('distantUserCount'))} />
                <Tile titulo="Sesiones de robots" valor={valorBonito(sumar('totalBotSessionCount'))} />
                {filasTrafico.length === 1 && filasTrafico[0].PagesPerSessionPercentage != null ? (
                  <Tile titulo="Páginas por sesión" valor={valorBonito(filasTrafico[0].PagesPerSessionPercentage)} />
                ) : null}
              </div>
            ) : null}
            {otras.length === 0 && !filasTrafico.length ? (
              <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Clarity todavía no tiene datos (tarda unas horas después de instalarlo).</p>
            ) : null}
            <div style={s.rejilla}>
              {otras.map((m) => {
                const filas = m.information.slice(0, 10);
                const columnas = [...new Set(filas.flatMap((f) => Object.keys(f)))];
                return (
                  <div key={m.metricName} style={s.metrica}>
                    <div style={s.metricaTitulo}>{nombreMetrica(m.metricName)}</div>
                    <div className="pos-tabla-scroll">
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr>
                            {columnas.map((c) => (
                              <th key={c} style={s.th}>{nombreCampo(c)}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filas.map((f, i) => (
                            <tr key={i}>
                              {columnas.map((c) => (
                                <td key={c} style={s.td}>{valorBonito(f[c])}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
              Actualizado: {data.en ? new Date(data.en).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : '—'}. Clarity permite pocas
              consultas al día, así que este resumen se actualiza solo cada 6 horas.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px', marginBottom: '16px' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', background: 'var(--teal)', color: '#fff', fontWeight: 700, textDecoration: 'none', fontSize: '14px' },
  btn: { padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', color: 'inherit', textDecoration: 'none', fontSize: '14px' },
  btnChico: { padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '13px' },
  btnChicoActivo: { background: 'var(--teal)', color: '#fff', borderColor: 'var(--teal)' },
  tiles: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '14px' },
  tile: { border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' },
  tileValor: { fontSize: '22px', fontWeight: 800 },
  tileTitulo: { fontSize: '12px', color: 'var(--text-secondary)' },
  rejilla: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' },
  metrica: { border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px', minWidth: 0 },
  metricaTitulo: { fontWeight: 700, fontSize: '14px', marginBottom: '6px' },
  th: { textAlign: 'left', padding: '4px 6px', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' },
  td: { padding: '4px 6px', borderBottom: '1px solid var(--border)' },
};
