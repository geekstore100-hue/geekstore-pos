'use client';

import { useEffect, useState } from 'react';

// Analíticas → Tienda online. Tablero con las estadísticas propias de
// geekstore.com.co (ver app/api/analiticas/tienda/route.js): cuánta gente
// entra, de dónde llega, qué productos mira, cuáles agrega al carrito,
// cuántos empiezan a pagar, cuántos compran, qué busca y no encuentra, y
// cómo le va al chat con IA. Los datos se cuentan desde que se subió la
// actualización de la tienda (octubre 2026).

const PERIODOS = [
  [1, 'Hoy'],
  [7, '7 días'],
  [30, '30 días'],
  [90, '90 días'],
];

const NOMBRE_FUENTE = {
  google: 'Google',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
  youtube: 'YouTube',
  bing: 'Bing',
  directo: 'Directo (escribieron la dirección o un enlace guardado)',
  otro: 'Otras páginas',
  interno: 'Interno',
};

function pesos(v) {
  return '$' + Math.round(Number(v) || 0).toLocaleString('es-CO');
}
function num(v) {
  return Math.round(Number(v) || 0).toLocaleString('es-CO');
}
function pct(a, b) {
  return b ? `${(Math.round((a / b) * 1000) / 10).toLocaleString('es-CO')}%` : '—';
}
function porciento(v) {
  return `${(Number(v) || 0).toLocaleString('es-CO', { maximumFractionDigits: 1 })}%`;
}
function fechaCorta(iso) {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
}

function Tile({ titulo, valor, nota }) {
  return (
    <div style={styles.tile}>
      <div style={styles.tileValor}>{valor}</div>
      <div style={styles.tileTitulo}>{titulo}</div>
      {nota ? <div style={styles.tileNota}>{nota}</div> : null}
    </div>
  );
}

// Barras verticales de una sola serie por día, con el valor al pasar el mouse.
function BarrasPorDia({ datos, campo, formato = num, titulo }) {
  const [activo, setActivo] = useState(null);
  const max = Math.max(1, ...datos.map((d) => Number(d[campo]) || 0));
  const total = datos.reduce((a, d) => a + (Number(d[campo]) || 0), 0);
  const etiquetaCada = datos.length > 31 ? 14 : datos.length > 10 ? 5 : 1;
  return (
    <div style={styles.tarjeta}>
      <div style={styles.tituloGrafica}>
        {titulo} <span style={styles.gris}>· total {formato(total)}</span>
      </div>
      <div style={{ position: 'relative' }}>
        <div style={styles.barrasDia} role="img" aria-label={`${titulo} por día`} onMouseLeave={() => setActivo(null)}>
          {datos.map((d, i) => {
            const v = Number(d[campo]) || 0;
            return (
              <div
                key={d.fecha}
                style={styles.columnaDia}
                onMouseEnter={() => setActivo(i)}
                onFocus={() => setActivo(i)}
                tabIndex={0}
                aria-label={`${fechaCorta(d.fecha)}: ${formato(v)}`}
              >
                <div
                  style={{
                    ...styles.barraDia,
                    height: `${Math.max(v ? 3 : 0, (v / max) * 100)}%`,
                    opacity: activo === null || activo === i ? 1 : 0.45,
                  }}
                />
              </div>
            );
          })}
        </div>
        {activo !== null ? (
          <div
            style={{
              ...styles.tooltip,
              left: `${Math.min(85, Math.max(0, ((activo + 0.5) / datos.length) * 100 - 8))}%`,
            }}
          >
            <strong>{formato(datos[activo][campo])}</strong>
            <div style={styles.gris}>{fechaCorta(datos[activo].fecha)}</div>
          </div>
        ) : null}
      </div>
      <div style={styles.ejeDia}>
        {datos.map((d, i) => (
          <div key={d.fecha} style={styles.etiquetaDia}>
            {i % etiquetaCada === 0 || i === datos.length - 1 ? fechaCorta(d.fecha) : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

// Barras horizontales (embudo, fuentes): etiqueta, barra y valor en texto.
function BarrasHorizontales({ filas, total }) {
  const max = Math.max(1, ...filas.map((f) => f.valor));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {filas.map((f) => (
        <div key={f.etiqueta} title={`${f.etiqueta}: ${num(f.valor)}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '3px' }}>
            <span>{f.etiqueta}</span>
            <span style={{ fontWeight: 600 }}>
              {num(f.valor)}
              {total ? <span style={styles.gris}> · {pct(f.valor, total)}</span> : null}
            </span>
          </div>
          <div style={styles.pistaBarra}>
            <div style={{ ...styles.barraH, width: `${(f.valor / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TablaProductos({ titulo, explicacion, filas, columnas }) {
  return (
    <div style={styles.tarjeta}>
      <div style={styles.tituloGrafica}>{titulo}</div>
      {explicacion ? <p style={{ ...styles.gris, fontSize: '12px', margin: '0 0 8px' }}>{explicacion}</p> : null}
      {filas.length === 0 ? (
        <p style={{ ...styles.gris, fontSize: '13px' }}>Todavía no hay datos en este periodo.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.tabla}>
            <thead>
              <tr>
                <th style={styles.th}>Producto</th>
                {columnas.map(([, nombre]) => (
                  <th key={nombre} style={{ ...styles.th, textAlign: 'right' }}>
                    {nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => (
                <tr key={p.id}>
                  <td style={styles.td}>
                    {p.referencia ? <span style={styles.gris}>{p.referencia} · </span> : null}
                    {p.nombre || p.id}
                  </td>
                  {columnas.map(([campo, nombre, fmt]) => (
                    <td key={nombre} style={{ ...styles.td, textAlign: 'right', ...(campo === 'stock' && Number(p.stock) <= 0 ? { color: 'var(--danger)', fontWeight: 600 } : {}) }}>
                      {p[campo] === undefined || p[campo] === null ? '—' : (fmt || num)(p[campo])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AnaliticasTienda() {
  const [dias, setDias] = useState(7);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');
    fetch(`/api/analiticas/tienda?dias=${dias}`)
      .then((r) => r.json())
      .then((d) => {
        if (!vigente) return;
        if (d.ok) setDatos(d);
        else setError(d.error || 'No se pudieron cargar las estadísticas');
      })
      .catch(() => vigente && setError('Error de conexión'))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [dias]);

  const t = datos?.totales;
  const chat = datos?.chat;

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
        {PERIODOS.map(([d, nombre]) => (
          <button key={d} onClick={() => setDias(d)} style={{ ...styles.chip, ...(dias === d ? styles.chipActivo : {}) }}>
            {nombre}
          </button>
        ))}
        {cargando ? <span style={styles.gris}>Cargando…</span> : null}
      </div>

      {error ? (
        <div style={{ ...styles.tarjeta, borderColor: 'var(--danger)' }}>
          <p style={{ color: 'var(--danger)', marginTop: 0 }}>{error}</p>
          <p style={{ ...styles.gris, fontSize: '13px', marginBottom: 0 }}>
            Para que funcione: en Netlify de la tienda y del POS crea la variable <code>ESTADISTICAS_CLAVE</code> con el MISMO valor
            (una clave inventada, larga), y vuelve a publicar los dos sitios.
          </p>
        </div>
      ) : null}

      {t ? (
        <>
          <div style={styles.tiles}>
            <Tile titulo="Visitas" valor={num(t.visitas)} nota={`${num(t.visitantes)} personas · ${num(t.nuevos)} nuevas`} />
            <Tile titulo="Productos vistos" valor={num(t.vistasProducto)} nota={`${num(t.productosVistos)} productos distintos`} />
            <Tile titulo="Agregados al carrito" valor={num(t.agregadosCarrito)} nota="unidades" />
            <Tile titulo="Empezaron a pagar" valor={num(t.checkouts)} nota={pesos(t.checkoutValor)} />
            <Tile titulo="Compras" valor={num(t.compras)} nota={pesos(t.ventas)} />
            <Tile titulo="Conversión" valor={pct(t.compras, t.visitas)} nota="compras por cada visita" />
          </div>

          <div style={styles.grilla2}>
            <div style={styles.tarjeta}>
              <div style={styles.tituloGrafica}>Embudo de ventas</div>
              <BarrasHorizontales
                total={t.visitas}
                filas={[
                  { etiqueta: 'Visitas', valor: t.visitas },
                  { etiqueta: 'Empezaron a pagar', valor: t.checkouts },
                  { etiqueta: 'Compraron', valor: t.compras },
                ]}
              />
              <p style={{ ...styles.gris, fontSize: '12px', marginBottom: 0 }}>
                {t.checkouts > t.compras
                  ? `${num(t.checkouts - t.compras)} empezaron a pagar y no terminaron (te llegan como carritos abandonados).`
                  : 'Los porcentajes son sobre el total de visitas.'}
              </p>
            </div>
            <div style={styles.tarjeta}>
              <div style={styles.tituloGrafica}>¿De dónde llegan?</div>
              <BarrasHorizontales
                total={t.visitas}
                filas={Object.entries(datos.fuentes || {})
                  .filter(([f]) => f !== 'interno')
                  .sort((a, b) => b[1] - a[1])
                  .map(([f, n]) => ({ etiqueta: NOMBRE_FUENTE[f] || f, valor: n }))}
              />
              <p style={{ ...styles.gris, fontSize: '12px', marginBottom: 0 }}>
                Celular {pct(datos.dispositivos?.movil || 0, t.visitas)} · Computador {pct(datos.dispositivos?.escritorio || 0, t.visitas)}
              </p>
            </div>
          </div>

          {datos.porDia.length > 1 ? (
            <div style={styles.grilla2}>
              <BarrasPorDia datos={datos.porDia} campo="visitas" titulo="Visitas por día" />
              <BarrasPorDia datos={datos.porDia} campo="ventas" titulo="Ventas por día" formato={pesos} />
            </div>
          ) : null}

          <TablaProductos
            titulo="Productos más vistos"
            filas={datos.masVistos}
            columnas={[
              ['vistas', 'Vistas'],
              ['carrito', 'Al carrito'],
              ['unidades', 'Vendidos'],
              ['stock', 'Stock'],
            ]}
          />
          <div style={styles.grilla2}>
            <TablaProductos
              titulo="Muy vistos, pero no se venden"
              explicacion="Los miran 5 veces o más y nadie los compra: revisa el precio, las fotos, la descripción o si hay stock."
              filas={datos.vistosSinVenta}
              columnas={[
                ['vistas', 'Vistas'],
                ['carrito', 'Al carrito'],
                ['stock', 'Stock'],
              ]}
            />
            <TablaProductos
              titulo="Más vendidos en la tienda online"
              filas={datos.masVendidos}
              columnas={[
                ['unidades', 'Unidades'],
                ['ventas', 'Ventas', pesos],
              ]}
            />
          </div>

          <div style={styles.grilla2}>
            <div style={styles.tarjeta}>
              <div style={styles.tituloGrafica}>Lo que buscan y no encuentran</div>
              <p style={{ ...styles.gris, fontSize: '12px', margin: '0 0 8px' }}>
                Búsquedas que dieron 0 resultados. Si lo tienes, revisa el nombre del producto; si no, es una idea de qué traer.
              </p>
              {datos.busquedasSinResultado.length ? (
                <table style={styles.tabla}>
                  <tbody>
                    {datos.busquedasSinResultado.map((b) => (
                      <tr key={b.q}>
                        <td style={styles.td}>{b.q}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{num(b.sinResultados)} veces</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ ...styles.gris, fontSize: '13px' }}>Nada en este periodo.</p>
              )}
            </div>
            <div style={styles.tarjeta}>
              <div style={styles.tituloGrafica}>Lo más buscado</div>
              {datos.busquedas.length ? (
                <table style={styles.tabla}>
                  <tbody>
                    {datos.busquedas.slice(0, 15).map((b) => (
                      <tr key={b.q}>
                        <td style={styles.td}>{b.q}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{num(b.veces)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ ...styles.gris, fontSize: '13px' }}>Nada en este periodo.</p>
              )}
            </div>
          </div>

          {chat ? (
            <div style={styles.tarjeta}>
              <div style={styles.tituloGrafica}>
                Chat con IA <span style={styles.gris}>· últimos {Math.min(dias, 30)} días</span>
              </div>
              <div style={styles.tiles}>
                <Tile titulo="Conversaciones" valor={num(chat.conversaciones)} nota={`${num(chat.preguntas)} preguntas`} />
                <Tile titulo="Resueltas sin WhatsApp" valor={porciento(chat.resueltasSinWhatsapp)} />
                <Tile titulo="Llegaron al carrito" valor={porciento(chat.llegaronAlCarrito)} />
                <Tile titulo="Compraron" valor={porciento(chat.compraron)} nota={pesos(chat.ventas)} />
                <Tile
                  titulo="Satisfacción"
                  valor={chat.opiniones.bien + chat.opiniones.mal ? porciento(chat.opiniones.satisfaccion) : '—'}
                  nota={`👍 ${chat.opiniones.bien} · 👎 ${chat.opiniones.mal}`}
                />
                <Tile titulo="Clics a WhatsApp" valor={num(Object.values(datos.whatsapp || {}).reduce((a, n) => a + n, 0))} nota="desde toda la tienda" />
              </div>
              <p style={{ ...styles.gris, fontSize: '12px', marginBottom: 0 }}>
                El detalle de las conversaciones está en geekstore.com.co/admin → 💬 Chat.
              </p>
            </div>
          ) : null}

          <p style={{ ...styles.gris, fontSize: '12px' }}>
            Estadísticas propias de la tienda, contadas desde la actualización de octubre 2026. No cuentan robots ni el panel de
            administración. Google Analytics sigue funcionando aparte (pestaña &quot;Google Analytics&quot;).
          </p>
        </>
      ) : null}
    </div>
  );
}

const styles = {
  gris: { color: 'var(--text-secondary)', fontWeight: 400 },
  chip: { padding: '7px 14px', borderRadius: '999px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '14px' },
  chipActivo: { background: 'var(--teal)', borderColor: 'var(--teal)', color: '#fff', fontWeight: 600 },
  tiles: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', marginBottom: '14px' },
  tile: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px' },
  tileValor: { fontSize: '24px', fontWeight: 700, lineHeight: 1.15 },
  tileTitulo: { fontSize: '13px', fontWeight: 600, marginTop: '2px' },
  tileNota: { fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' },
  tarjeta: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: '14px', minWidth: 0 },
  tituloGrafica: { fontWeight: 600, fontSize: '15px', marginBottom: '10px' },
  grilla2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' },
  pistaBarra: { height: '10px', background: 'var(--bg)', borderRadius: '999px', overflow: 'hidden' },
  barraH: { height: '100%', background: 'var(--teal)', borderRadius: '999px', minWidth: '2px' },
  barrasDia: { display: 'flex', alignItems: 'flex-end', gap: '2px', height: '140px', borderBottom: '1px solid var(--border)' },
  columnaDia: { flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', cursor: 'default', outline: 'none' },
  barraDia: { width: '100%', background: 'var(--teal)', borderRadius: '4px 4px 0 0', transition: 'opacity 0.1s' },
  ejeDia: { display: 'flex', gap: '2px', marginTop: '4px' },
  etiquetaDia: { flex: 1, fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'visible' },
  tooltip: {
    position: 'absolute',
    top: '-6px',
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '4px 8px',
    fontSize: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  },
  tabla: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { textAlign: 'left', padding: '6px 6px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' },
  td: { padding: '6px 6px', borderBottom: '1px solid var(--border)' },
};
