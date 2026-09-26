'use client';

import { useEffect, useMemo, useState } from 'react';

// Sección dedicada para imprimir etiquetas de 74mm x 45mm (con logo
// configurable en Ajustes > Etiquetas de producto). Reemplaza el enfoque
// anterior (casillas dentro de la tabla de Productos + página aparte de
// impresión): acá se buscan los artículos, se arma una lista con las
// cantidades y datos adicionales de cada uno, y se imprime todo desde la
// misma pantalla — el mismo patrón de /traspasos/[id]/imprimir (un panel que
// no se imprime, más las etiquetas que sí).
//
// No usa <Shell> a propósito: la hoja de estilo de impresión define un
// tamaño de página (74mm x 45mm) muy distinto al resto del sistema (A4), así
// que esta pantalla se imprime sola, sin la barra lateral.

const LIMITE_RESULTADOS = 20;

export default function EtiquetasPage() {
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [logoKey, setLogoKey] = useState(null);
  const [error, setError] = useState('');

  const [busqueda, setBusqueda] = useState('');
  const [cola, setCola] = useState([]); // [{ id, producto, cantidad, nota, nombreEtiqueta }]

  useEffect(() => {
    async function cargar() {
      try {
        const [rProd, rLogo] = await Promise.all([
          fetch('/api/productos'),
          fetch('/api/configuracion/logo-etiqueta'),
        ]);
        const dProd = await rProd.json();
        const dLogo = await rLogo.json();
        if (!dProd.ok) {
          setError(dProd.error || 'No se pudieron cargar los productos');
        } else {
          setProductos(dProd.productos);
        }
        if (dLogo.ok) setLogoKey(dLogo.imagen_key);
      } catch (e) {
        setError('No se pudo conectar con el servidor');
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    return productos
      .filter((p) => p.referencia.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q))
      .slice(0, LIMITE_RESULTADOS);
  }, [busqueda, productos]);

  function agregarProducto(p) {
    setCola((actual) => {
      const existe = actual.find((item) => item.id === p.id);
      if (existe) {
        return actual.map((item) => (item.id === p.id ? { ...item, cantidad: item.cantidad + 1 } : item));
      }
      // nombreEtiqueta arranca igual al nombre del producto, pero es
      // editable acá sin tocar el producto real — para acortar o cambiar
      // cómo se ve el nombre en la etiqueta sin afectar el catálogo.
      return [...actual, { id: p.id, producto: p, cantidad: 1, nota: '', nombreEtiqueta: p.nombre }];
    });
  }

  function quitarDeCola(id) {
    setCola((actual) => actual.filter((item) => item.id !== id));
  }

  function cambiarCantidad(id, valor) {
    const n = Math.max(1, Math.min(50, Number(valor) || 1));
    setCola((actual) => actual.map((item) => (item.id === id ? { ...item, cantidad: n } : item)));
  }

  function cambiarNota(id, valor) {
    setCola((actual) => actual.map((item) => (item.id === id ? { ...item, nota: valor } : item)));
  }

  function cambiarNombreEtiqueta(id, valor) {
    setCola((actual) => actual.map((item) => (item.id === id ? { ...item, nombreEtiqueta: valor } : item)));
  }

  function formatoPrecio(n) {
    return '$' + Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
  }

  // Encoge un poco la letra del nombre cuando es largo, para que casi
  // siempre quepa en una sola línea (a ojo, con Arial en negrita mayúscula,
  // sobre los ~62mm de ancho útil de la etiqueta ya no caben mucho más de
  // 24-25 letras a 11pt). Es una aproximación, no una medición exacta.
  function tamanioFuenteNombre(texto) {
    const largo = String(texto || '').length;
    if (largo > 34) return '8.5pt';
    if (largo > 24) return '9.5pt';
    return '11pt';
  }

  const logoUrl = logoKey ? `/api/imagenes/${logoKey}` : null;
  const totalEtiquetas = cola.reduce((acc, item) => acc + item.cantidad, 0);

  // Una etiqueta repetida tantas veces como diga su cantidad, conservando el
  // nombre editado y la nota (dato adicional) de cada artículo.
  const etiquetas = cola.flatMap((item) =>
    Array.from({ length: item.cantidad }, (_, i) => ({
      producto: item.producto,
      nombreEtiqueta: item.nombreEtiqueta || item.producto.nombre,
      nota: item.nota,
      copia: i,
    }))
  );

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', color: '#111' }}>
      <style>{`
        @media print {
          /* Nelson imprime en hojas tamaño Carta con varias etiquetas por
             hoja (no un rollo de una sola etiqueta por página), así que acá
             NO se fuerza el tamaño de página a 74mm x 45mm — eso era lo que
             hacía que Chrome sacara cada etiqueta perdida en una hoja carta
             enorme, con encabezados y pies de página de Chrome. En vez de
             eso, las etiquetas fluyen en una cuadrícula dentro de la hoja
             carta normal, tantas como quepan por fila, y siguen a la
             siguiente hoja solo cuando se llena. */
          @page { margin: 10mm; }
          .no-imprimir { display: none; }
          .hoja-etiquetas { display: flex; flex-wrap: wrap; gap: 4mm; }
          .etiqueta { break-inside: avoid; page-break-inside: avoid; }
        }
        @media screen {
          .hoja-etiquetas { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
          .etiqueta { box-shadow: 0 1px 4px rgba(0,0,0,0.15); }
        }
      `}</style>

      <div className="no-imprimir" style={styles.panel}>
        <a href="/productos" style={styles.volver}>← Volver a Productos</a>
        <h2 style={{ marginTop: '10px', marginBottom: '4px' }}>Imprimir etiquetas</h2>
        <p style={{ color: '#555', marginTop: 0 }}>
          Busca los artículos, agrégalos a la lista y ajusta cantidad o texto adicional (por ejemplo, las
          características del equipo) antes de imprimir. Las etiquetas salen en cuadrícula sobre hojas tamaño Carta,
          varias por hoja, con un borde delgado para recortarlas. Antes de imprimir, en el diálogo de impresión abre
          "Más ajustes" y desmarca "Encabezados y pies de página" (si no, Chrome agrega la fecha y la URL en cada
          hoja) — Chrome recuerda esa opción para la próxima vez.
        </p>

        {error && <p style={{ color: '#c0392b' }}>{error}</p>}

        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={cargando ? 'Cargando productos...' : 'Buscar por referencia o nombre...'}
          disabled={cargando}
          style={styles.buscador}
        />

        {resultados.length > 0 && (
          <div style={styles.resultados}>
            {resultados.map((p) => (
              <div key={p.id} style={styles.resultadoFila}>
                <span style={{ flex: 1 }}>
                  <strong>{p.referencia}</strong> — {p.nombre} — {formatoPrecio(p.precio_venta)}
                </span>
                <button onClick={() => agregarProducto(p)} style={styles.btnAgregar}>
                  + Agregar
                </button>
              </div>
            ))}
          </div>
        )}
        {busqueda.trim() && resultados.length === 0 && !cargando && (
          <p style={{ color: '#888', fontSize: '13px' }}>Ningún producto coincide con la búsqueda.</p>
        )}

        {cola.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', margin: '18px 0 16px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                <th style={styles.th}>Referencia</th>
                <th style={styles.th}>Artículo</th>
                <th style={styles.th}>Nombre en la etiqueta</th>
                <th style={styles.th}>Precio</th>
                <th style={styles.th}>Copias</th>
                <th style={styles.th}>Texto adicional (opcional)</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {cola.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={styles.td}>{item.producto.referencia}</td>
                  <td style={styles.td}>{item.producto.nombre}</td>
                  <td style={styles.td}>
                    <input
                      value={item.nombreEtiqueta}
                      onChange={(e) => cambiarNombreEtiqueta(item.id, e.target.value)}
                      placeholder={item.producto.nombre}
                      style={styles.inputNota}
                    />
                  </td>
                  <td style={styles.td}>{formatoPrecio(item.producto.precio_venta)}</td>
                  <td style={styles.td}>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={item.cantidad}
                      onChange={(e) => cambiarCantidad(item.id, e.target.value)}
                      style={styles.inputCantidad}
                    />
                  </td>
                  <td style={styles.td}>
                    <input
                      value={item.nota}
                      onChange={(e) => cambiarNota(item.id, e.target.value)}
                      placeholder="Ej: Core i7 13va, RAM 16GB, M.2 512GB"
                      style={styles.inputNota}
                    />
                  </td>
                  <td style={styles.td}>
                    <button onClick={() => quitarDeCola(item.id)} style={styles.btnQuitar} title="Quitar de la lista">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <button onClick={() => window.print()} disabled={cola.length === 0} style={styles.btnImprimir}>
          Imprimir ({totalEtiquetas} {totalEtiquetas === 1 ? 'etiqueta' : 'etiquetas'})
        </button>
        {!logoKey && (
          <p style={{ fontSize: '12px', color: '#888', marginTop: '10px' }}>
            No tienes un logo configurado — las etiquetas se imprimen sin logo. Puedes subir uno en
            Configuraciones &gt; Etiquetas de producto.
          </p>
        )}
      </div>

      <div className="hoja-etiquetas">
        {etiquetas.map(({ producto, nombreEtiqueta, nota, copia }) => (
          <div key={`${producto.id}-${copia}`} className="etiqueta" style={styles.etiqueta}>
            <div style={styles.logoContenedor}>
              {logoUrl && <img src={logoUrl} alt="" style={styles.logo} />}
            </div>
            <div style={styles.textos}>
              <div style={{ ...styles.nombre, fontSize: tamanioFuenteNombre(nombreEtiqueta) }}>{nombreEtiqueta}</div>
              {nota && <div style={styles.nota}>{nota}</div>}
            </div>
            <div style={styles.precio}>{formatoPrecio(producto.precio_venta)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  panel: { padding: '24px', maxWidth: '900px', margin: '0 auto' },
  volver: { color: '#1F7AE0', fontSize: '13px', textDecoration: 'none' },
  buscador: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #ccc',
    boxSizing: 'border-box',
    fontSize: '14px',
    marginTop: '6px',
  },
  resultados: {
    border: '1px solid #eee',
    borderRadius: '8px',
    marginTop: '8px',
    maxHeight: '260px',
    overflowY: 'auto',
  },
  resultadoFila: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 12px',
    borderBottom: '1px solid #f0f0f0',
    fontSize: '13px',
  },
  btnAgregar: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #1F7AE0',
    background: '#fff',
    color: '#1F7AE0',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '12px',
    whiteSpace: 'nowrap',
  },
  th: { padding: '8px 6px', fontSize: '13px', color: '#555' },
  td: { padding: '8px 6px', fontSize: '14px' },
  inputCantidad: { width: '56px', padding: '5px', borderRadius: '6px', border: '1px solid #ccc' },
  inputNota: { width: '100%', padding: '5px 8px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box', fontSize: '13px' },
  btnQuitar: { border: 'none', background: 'none', cursor: 'pointer', color: '#c0392b', fontSize: '14px' },
  btnImprimir: {
    padding: '10px 18px',
    borderRadius: '8px',
    border: 'none',
    background: '#1F7AE0',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '14px',
  },
  // Sin padding arriba, a la izquierda ni a la derecha: el logo debe tocar
  // el recuadro negro por esos 3 lados (ocupa el 100% del ancho de este
  // contenedor, ver "logoContenedor" más abajo). Solo queda padding abajo,
  // para separar el precio del borde inferior. El nombre, el texto
  // adicional y el precio sí tienen su propio padding lateral (ver "textos"
  // y "precio" más abajo) para no pegarse al borde ellos.
  etiqueta: {
    width: '74mm',
    height: '45mm',
    flexShrink: 0,
    boxSizing: 'border-box',
    border: '1px solid #000',
    padding: '0 0 2mm 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    textAlign: 'center',
    overflow: 'hidden',
  },
  // El logo ocupa el 100% del ancho de la etiqueta (sin ningún padding a los
  // lados, ver nota arriba) y el alto se ajusta solo según su proporción
  // real (width:100% + height:auto), así que llega hasta el borde negro sin
  // deformarse.
  logoContenedor: {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logo: { width: '100%', height: 'auto', display: 'block' },
  textos: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', width: '100%', padding: '0 3mm', boxSizing: 'border-box' },
  nombre: {
    fontWeight: 700,
    fontSize: '11pt',
    lineHeight: 1.15,
    textTransform: 'uppercase',
    overflow: 'hidden',
  },
  nota: {
    fontWeight: 700,
    fontSize: '8.5pt',
    lineHeight: 1.1,
    textTransform: 'uppercase',
    overflow: 'hidden',
    color: '#222',
  },
  // Línea delgada justo antes del precio, para separarlo visualmente del
  // nombre/texto adicional (pedido de Nelson). Va de borde a borde, igual
  // que el logo, para que se vea como una sola franja horizontal completa.
  precio: {
    width: '100%',
    boxSizing: 'border-box',
    borderTop: '1px solid #000',
    padding: '1.2mm 3mm 0',
    fontWeight: 800,
    fontSize: '17pt',
  },
};
