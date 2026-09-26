'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// Imprime etiquetas de precio de 74mm x 45mm (una por unidad elegida), con
// logo configurable (Ajustes > Etiquetas de producto), nombre del artículo y
// precio de venta. No usa <Shell> a propósito, igual que
// /traspasos/[id]/imprimir: es una página aparte pensada para imprimirse
// sola. Recibe los productos a imprimir por la URL: /etiquetas/imprimir?ids=12,45,50
// (se abre así desde Productos, al elegir uno o varios artículos).
function ImprimirEtiquetasContenido() {
  const searchParams = useSearchParams();
  const idsParam = searchParams.get('ids') || '';
  const ids = idsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const [productos, setProductos] = useState(null);
  const [logoKey, setLogoKey] = useState(null);
  const [cantidades, setCantidades] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    async function cargar() {
      if (ids.length === 0) {
        setError('No se eligió ningún producto. Vuelve a Productos y selecciona al menos uno.');
        return;
      }
      const [rProd, rLogo] = await Promise.all([
        fetch('/api/productos'),
        fetch('/api/configuracion/logo-etiqueta'),
      ]);
      const dProd = await rProd.json();
      const dLogo = await rLogo.json();
      if (!dProd.ok) {
        setError(dProd.error || 'No se pudieron cargar los productos');
        return;
      }
      // Conserva el orden en que se eligieron, no el orden de la tabla.
      const elegidos = ids
        .map((id) => dProd.productos.find((p) => String(p.id) === id))
        .filter(Boolean);
      if (elegidos.length === 0) {
        setError('No se encontraron los productos elegidos.');
        return;
      }
      setProductos(elegidos);
      setCantidades(Object.fromEntries(elegidos.map((p) => [p.id, 1])));
      if (dLogo.ok) setLogoKey(dLogo.imagen_key);
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsParam]);

  function cambiarCantidad(id, valor) {
    const n = Math.max(1, Math.min(50, Number(valor) || 1));
    setCantidades((c) => ({ ...c, [id]: n }));
  }

  function formatoPrecio(n) {
    return '$' + Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
  }

  if (error) {
    return <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif' }}>{error}</div>;
  }
  if (!productos) {
    return <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif' }}>Cargando...</div>;
  }

  const logoUrl = logoKey ? `/api/imagenes/${logoKey}` : null;

  // Una etiqueta repetida tantas veces como diga su cantidad.
  const etiquetas = productos.flatMap((p) =>
    Array.from({ length: cantidades[p.id] || 1 }, (_, i) => ({ producto: p, copia: i }))
  );

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', color: '#111' }}>
      <style>{`
        @media print {
          @page { size: 74mm 45mm; margin: 0; }
          .no-imprimir { display: none; }
          .etiqueta { page-break-after: always; }
          .etiqueta:last-child { page-break-after: auto; }
          body { margin: 0; }
        }
        @media screen {
          .etiqueta { margin: 0 auto 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.15); }
        }
      `}</style>

      <div className="no-imprimir" style={styles.panel}>
        <h2 style={{ marginTop: 0 }}>Imprimir etiquetas ({etiquetas.length})</h2>
        <p style={{ color: '#555', marginTop: '-6px' }}>
          Cada etiqueta mide 74mm x 45mm. Ajusta la cantidad de copias de cada producto si necesitas más de una, y
          luego imprime — recuerda configurar el tamaño de papel/etiqueta en el diálogo de impresión.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
              <th style={styles.th}>Referencia</th>
              <th style={styles.th}>Artículo</th>
              <th style={styles.th}>Precio</th>
              <th style={styles.th}>Copias</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={styles.td}>{p.referencia}</td>
                <td style={styles.td}>{p.nombre}</td>
                <td style={styles.td}>{formatoPrecio(p.precio_venta)}</td>
                <td style={styles.td}>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={cantidades[p.id] || 1}
                    onChange={(e) => cambiarCantidad(p.id, e.target.value)}
                    style={styles.inputCantidad}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={() => window.print()} style={styles.btnImprimir}>
          Imprimir
        </button>
        {!logoKey && (
          <p style={{ fontSize: '12px', color: '#888', marginTop: '10px' }}>
            No tienes un logo configurado — las etiquetas se imprimen sin logo. Puedes subir uno en
            Configuraciones &gt; Etiquetas de producto.
          </p>
        )}
      </div>

      {etiquetas.map(({ producto, copia }) => (
        <div key={`${producto.id}-${copia}`} className="etiqueta" style={styles.etiqueta}>
          {logoUrl ? (
            <img src={logoUrl} alt="" style={styles.logo} />
          ) : (
            <div style={{ height: '4mm' }} />
          )}
          <div style={styles.nombre}>{producto.nombre}</div>
          <div style={styles.precio}>{formatoPrecio(producto.precio_venta)}</div>
        </div>
      ))}
    </div>
  );
}

export default function ImprimirEtiquetasPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', fontFamily: 'Arial, sans-serif' }}>Cargando...</div>}>
      <ImprimirEtiquetasContenido />
    </Suspense>
  );
}

const styles = {
  panel: { padding: '24px', maxWidth: '820px', margin: '0 auto' },
  th: { padding: '8px 6px', fontSize: '13px', color: '#555' },
  td: { padding: '8px 6px', fontSize: '14px' },
  inputCantidad: { width: '56px', padding: '5px', borderRadius: '6px', border: '1px solid #ccc' },
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
  etiqueta: {
    width: '74mm',
    height: '45mm',
    boxSizing: 'border-box',
    border: '1px solid #000',
    padding: '3mm',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    textAlign: 'center',
    overflow: 'hidden',
  },
  logo: { maxHeight: '10mm', maxWidth: '90%', objectFit: 'contain' },
  nombre: {
    fontWeight: 700,
    fontSize: '12pt',
    lineHeight: 1.15,
    textTransform: 'uppercase',
    overflow: 'hidden',
  },
  precio: { fontWeight: 800, fontSize: '17pt' },
};
