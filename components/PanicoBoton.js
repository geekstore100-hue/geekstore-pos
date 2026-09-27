'use client';

import { useEffect, useState } from 'react';

// Control remoto del botón de pánico, pensado para el celular de Nelson:
// si desde las cámaras ve que alguien en el local está mirando donde no
// debe, toca este botón y OCULTA la pantalla del computador de la tienda
// (ver components/PanicoReceptor.js) — el estado se guarda compartido en
// la base de datos (ver lib/panico.js), no en este celular, así que este
// aparato nunca se oculta ni se bloquea a sí mismo, sin importar qué tan
// seguido se use.
//
// Solo aparece en pantallas de celular (media query abajo) — en un
// computador no pinta nada, para no estorbar ni confundir con la pantalla
// que sí se puede ocultar.
export default function PanicoBoton() {
  const [activo, setActivo] = useState(null); // null = todavía no se sabe
  const [cambiando, setCambiando] = useState(false);
  const [error, setError] = useState('');

  async function cargarEstado() {
    try {
      const res = await fetch('/api/panico/estado');
      const data = await res.json();
      if (data.ok) setActivo(data.activo);
    } catch {
      // Si no carga, el botón simplemente no aparece hasta que sí cargue
      // (ver el "if (activo === null) return null" más abajo) — mejor eso
      // que mostrar un botón que no se sabe en qué estado está.
    }
  }

  useEffect(() => {
    cargarEstado();
  }, []);

  async function alternar() {
    setError('');
    setCambiando(true);
    try {
      const res = await fetch('/api/panico/estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !activo }),
      });
      const data = await res.json();
      if (data.ok) {
        setActivo(data.activo);
      } else {
        setError('No se pudo cambiar');
      }
    } catch {
      setError('Sin conexión');
    } finally {
      setCambiando(false);
    }
  }

  if (activo === null) return null;

  return (
    <>
      <style>{`
        .pos-boton-panico { display: none; }
        @media (max-width: 768px) {
          .pos-boton-panico { display: flex; }
        }
      `}</style>
      <div className="pos-boton-panico pos-no-imprimir" style={styles.contenedor}>
        {error && <span style={styles.aviso}>{error}</span>}
        {activo && <span style={styles.aviso}>Pantalla del computador oculta</span>}
        <button
          type="button"
          onClick={alternar}
          disabled={cambiando}
          title={activo ? 'Mostrar de nuevo la pantalla del computador de la tienda' : 'Ocultar la pantalla del computador de la tienda'}
          aria-label={activo ? 'Mostrar de nuevo la pantalla del computador' : 'Ocultar la pantalla del computador'}
          style={{ ...styles.boton, ...(activo ? styles.botonActivo : {}) }}
        >
          <IconoOjo tachado={!activo} />
        </button>
      </div>
    </>
  );
}

function IconoOjo({ tachado }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      {tachado && <line x1="1" y1="1" x2="23" y2="23" />}
    </svg>
  );
}

const styles = {
  contenedor: {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    zIndex: 40,
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '6px',
  },
  boton: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    border: '1px solid rgba(0,0,0,0.08)',
    background: 'rgba(255,255,255,0.85)',
    color: '#9ca3af',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
  },
  botonActivo: {
    background: '#111827',
    color: '#fff',
    borderColor: '#111827',
  },
  aviso: {
    fontSize: '11px',
    background: '#111827',
    color: '#fff',
    padding: '4px 8px',
    borderRadius: '999px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
  },
};
