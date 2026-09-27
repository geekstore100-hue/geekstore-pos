'use client';

import { useEffect, useRef, useState } from 'react';

// Botón de pánico: pensado para cuando alguien en el local está mirando el
// celular donde no debe y hay que ocultar la pantalla YA, sin cerrar
// sesión ni perder lo que se estaba haciendo. Un toque la "apaga"
// (visualmente — la página sigue viva por detrás, con todo tal cual estaba)
// y solo se puede volver a ver con la misma clave de administrador que ya
// existe en Configuraciones > Seguridad (la que usa "Ajustes de
// inventario"). Si esa clave todavía no está configurada, cualquiera podría
// quitar la tapa, así que se avisa en el propio formulario de desbloqueo.
//
// Para que alguien mirando por encima del hombro no note ni el botón ni
// cómo se desbloquea:
// - El botón que activa esto solo aparece en pantallas de celular (ver la
//   media query más abajo), como un círculo gris discreto en la esquina.
// - Una vez activa, la tapa se ve como una pantalla de "Cargando..."
//   cualquiera — nada dice "pánico" ni "oculto". Para llegar al formulario
//   de la clave hay que tocar esa pantalla 5 veces seguidas (en menos de 3
//   segundos): un toque normal, o dos por curiosidad, no la revela.
//
// El estado (activo o no) se guarda en localStorage para que sobreviva
// recargas de página y cambios de pantalla dentro del navegador del
// celular — ver también el <script> en app/layout.js, que tapa la pantalla
// de inmediato si se recarga estando activo, antes de que React alcance a
// pintar nada real.
const LLAVE_LOCALSTORAGE = 'geekstore_panico_activo';
const ID_TAPA_INICIAL = 'pos-panic-cover-inicial';
const VENTANA_TOQUES_MS = 3000;
const TOQUES_PARA_REVELAR = 5;

function panicoGuardado() {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(LLAVE_LOCALSTORAGE) === '1';
  } catch {
    return false;
  }
}

export default function PanicoBoton() {
  const [activo, setActivo] = useState(panicoGuardado);
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [claveConfigurada, setClaveConfigurada] = useState(true);
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [verificando, setVerificando] = useState(false);
  const toquesRef = useRef([]);

  // Apenas React arranca, ya pintó su propia tapa (el return de abajo, si
  // activo === true) — ahí sí se puede quitar la tapa provisional que puso
  // el <script> plano de app/layout.js, sin que se alcance a ver nada real
  // entre una y otra.
  useEffect(() => {
    const tapaInicial = document.getElementById(ID_TAPA_INICIAL);
    if (tapaInicial) tapaInicial.remove();
  }, []);

  // Bloquea el scroll de fondo mientras está activo, y le quita el foco a
  // cualquier campo que hubiera quedado seleccionado en la pantalla real
  // (para que no le sigan llegando teclas mientras está "oculta").
  useEffect(() => {
    if (!activo) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflowPrevio;
    };
  }, [activo]);

  // Sabe si ya existe una clave de administrador configurada (nunca pide ni
  // recibe la clave en sí, solo si hay una) para poder avisar si el
  // desbloqueo está, por ahora, sin protección real.
  useEffect(() => {
    fetch('/api/configuracion/clave-admin/verificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clave: '' }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setClaveConfigurada(Boolean(d.configurada));
      })
      .catch(() => {});
  }, [activo]);

  function activar() {
    try {
      localStorage.setItem(LLAVE_LOCALSTORAGE, '1');
    } catch {
      // Si el navegador bloquea localStorage (modo privado, etc.) igual se
      // oculta la pantalla para esta sesión — solo que no sobrevive una
      // recarga.
    }
    setActivo(true);
    setFormularioAbierto(false);
    setClave('');
    setError('');
    toquesRef.current = [];
  }

  function tocarTapa() {
    const ahora = Date.now();
    toquesRef.current = toquesRef.current.filter((t) => ahora - t < VENTANA_TOQUES_MS);
    toquesRef.current.push(ahora);
    if (toquesRef.current.length >= TOQUES_PARA_REVELAR) {
      toquesRef.current = [];
      setFormularioAbierto(true);
    }
  }

  async function desbloquear(e) {
    e.preventDefault();
    setError('');
    setVerificando(true);
    try {
      const res = await fetch('/api/configuracion/clave-admin/verificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave }),
      });
      const data = await res.json();
      if (data.ok && data.valida) {
        try {
          localStorage.removeItem(LLAVE_LOCALSTORAGE);
        } catch {
          // Ver nota en activar().
        }
        setActivo(false);
        setFormularioAbierto(false);
        setClave('');
      } else {
        setError(data.error || 'Clave incorrecta');
      }
    } catch {
      setError('No hay conexión con el servidor');
    } finally {
      setVerificando(false);
    }
  }

  if (activo) {
    return (
      <div style={styles.tapa} onClick={tocarTapa}>
        <style>{`
          @keyframes pos-panico-girar { to { transform: rotate(360deg); } }
        `}</style>

        {!formularioAbierto ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
            <div style={styles.spinner} />
            <span style={styles.textoCargando}>Cargando...</span>
          </div>
        ) : (
          <form onClick={(e) => e.stopPropagation()} onSubmit={desbloquear} style={styles.formulario}>
            <p style={styles.formularioTitulo}>Escribe la clave para continuar</p>
            {!claveConfigurada && (
              <p style={styles.avisoSinClave}>
                Todavía no has configurado una clave en Configuraciones → Seguridad, así que cualquiera puede
                quitar esto con solo dejar el campo vacío y continuar. Ve a configurarla apenas puedas.
              </p>
            )}
            <input
              type="password"
              autoFocus
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              style={styles.input}
              placeholder="Clave"
            />
            {error && <p style={styles.error}>{error}</p>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" disabled={verificando} style={styles.botonContinuar}>
                {verificando ? 'Verificando...' : 'Continuar'}
              </button>
              <button type="button" onClick={() => setFormularioAbierto(false)} style={styles.botonCancelar}>
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Solo se muestra en celular a propósito (ver Nelson: es para
          activarlo discretamente desde el mostrador) — en un monitor de
          escritorio no pinta nada y no estorba. */}
      <style>{`
        .pos-boton-panico { display: none; }
        @media (max-width: 768px) {
          .pos-boton-panico { display: flex; }
        }
      `}</style>
      <button
        type="button"
        onClick={activar}
        className="pos-boton-panico pos-no-imprimir"
        title="Ocultar pantalla"
        aria-label="Ocultar pantalla"
        style={styles.botonFlotante}
      >
        <IconoOjo />
      </button>
    </>
  );
}

function IconoOjo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

const styles = {
  botonFlotante: {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    border: '1px solid rgba(0,0,0,0.08)',
    background: 'rgba(255,255,255,0.75)',
    color: '#9ca3af',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 40,
    boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
  },
  tapa: {
    position: 'fixed',
    inset: 0,
    height: '100dvh',
    width: '100vw',
    zIndex: 999999,
    background: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Arial, sans-serif',
  },
  spinner: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    border: '3px solid #d1d5db',
    borderTopColor: '#9ca3af',
    animation: 'pos-panico-girar 0.8s linear infinite',
  },
  textoCargando: { color: '#9ca3af', fontSize: '14px' },
  formulario: {
    background: '#fff',
    borderRadius: '12px',
    padding: '22px',
    width: '260px',
    maxWidth: '85vw',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  formularioTitulo: { margin: 0, fontSize: '14px', fontWeight: 600, color: '#111827' },
  avisoSinClave: { margin: 0, fontSize: '12px', color: '#b45309', background: '#fffbeb', padding: '8px', borderRadius: '8px' },
  input: { padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '16px' },
  error: { margin: 0, color: '#dc2626', fontSize: '13px' },
  botonContinuar: {
    flex: 1,
    padding: '10px',
    borderRadius: '8px',
    border: 'none',
    background: '#111827',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  },
  botonCancelar: {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    background: '#fff',
    color: '#374151',
    cursor: 'pointer',
  },
};
