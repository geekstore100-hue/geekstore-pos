'use client';

import { useEffect, useRef, useState } from 'react';

// Ventana para CREAR UN PRODUCTO desde la factura de compra (oct 2026).
// Abre el mismo formulario de "Nuevo producto" de la pantalla Productos
// (/productos?nuevo=1&embebido=1) dentro de un iframe, con TODO lo que
// tiene: IA (foto, enlace del fabricante o texto), fotos desde el enlace,
// quitar fondo, recortar, ficha técnica, categoría y subcategoría, precio
// distribuidor, Zona Gamer, oferta, video y creación en Alegra.
//
// prefill (opcional): lo que la factura ya sabe para prellenarlo:
//   { nombre, descripcion, categoria_id, subcategoria_id, precio_costo,
//     precio_venta, precio_distribuidor, especificaciones, es_gamer,
//     mostrar_en_tienda, con_iva, enlace, info, fotos: [dataUri, ...] }
//   (la primera foto queda de portada)
// onCreado(producto, aviso): cuando el producto quedó creado.
// onCerrar(): al cerrar sin crear.
export default function ModalProductoNuevo({ prefill, onCreado, onCerrar }) {
  const marco = useRef(null);
  const [cargando, setCargando] = useState(true);
  const prefillRef = useRef(prefill);
  prefillRef.current = prefill;
  const callbacks = useRef({ onCreado, onCerrar });
  callbacks.current = { onCreado, onCerrar };

  useEffect(() => {
    function recibir(e) {
      if (e.origin !== window.location.origin) return;
      if (!marco.current || e.source !== marco.current.contentWindow) return;
      const m = e.data || {};
      if (m.tipo === 'pos-producto-listo') {
        setCargando(false);
        if (prefillRef.current) {
          marco.current.contentWindow.postMessage({ tipo: 'pos-producto-prefill', datos: prefillRef.current }, window.location.origin);
        }
      } else if (m.tipo === 'pos-producto-creado' && m.producto) {
        callbacks.current.onCreado?.(m.producto, m.aviso || '');
      } else if (m.tipo === 'pos-producto-cancelado') {
        callbacks.current.onCerrar?.();
      }
    }
    window.addEventListener('message', recibir);
    return () => window.removeEventListener('message', recibir);
  }, []);

  return (
    <div style={s.fondo}>
      <div style={s.caja}>
        <div style={s.barra}>
          <strong>Nuevo producto</strong>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1, marginLeft: '10px' }}>
            Al guardarlo queda creado (también en Alegra) y se agrega a la factura.
          </span>
          <button type="button" onClick={() => callbacks.current.onCerrar?.()} style={s.cerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {cargando ? <div style={s.cargando}>Abriendo el formulario…</div> : null}
        <iframe ref={marco} src="/productos?nuevo=1&embebido=1" title="Nuevo producto" style={{ ...s.marco, opacity: cargando ? 0 : 1 }} />
      </div>
    </div>
  );
}

const s = {
  fondo: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' },
  caja: { background: '#fff', borderRadius: '12px', width: '1000px', maxWidth: '100%', height: '94vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.3)', position: 'relative' },
  barra: { display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)', gap: '6px' },
  cerrar: { border: 'none', background: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-secondary)' },
  marco: { flex: 1, width: '100%', border: 'none' },
  cargando: { position: 'absolute', top: '60px', left: 0, right: 0, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' },
};
