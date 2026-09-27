'use client';

import { useEffect, useRef, useState } from 'react';

// La pantalla que SÍ se oculta: pensada para el computador de la tienda.
// Cada pocos segundos pregunta si el pánico está activo (ver
// app/api/panico/estado y lib/panico.js) — si Nelson lo prende desde el
// celular (components/PanicoBoton.js), esta pantalla se tapa sola, sin que
// nadie la toque acá.
//
// A propósito, con dos seguros para que esto NUNCA se active en un
// celular (ver también PanicoBoton.js, que es el único que sí vive en
// celular): la media query de abajo, Y ADEMÁS un chequeo en JavaScript del
// ancho de pantalla — si alguno de los dos falla, el otro sigue
// protegiendo.
//
// La tapa se ve como una pantalla de "Cargando..." cualquiera — nada dice
// "pánico" ni "oculto". Para destaparla ahí mismo (sin depender del
// celular) hay que tocarla 5 veces seguidas en menos de 3 segundos, y
// después escribir la clave de administrador de Configuraciones →
// Seguridad — la misma que ya protege "Ajustes de inventario" — para que
// quien esté mirando donde no debe no pueda destaparla él mismo.
const INTERVALO_CONSULTA_MS = 4000;
const VENTANA_TOQUES_MS = 3000;
const TOQUES_PARA_REVELAR = 5;
const ANCHO_MAXIMO_CELULAR = 768;

function esAnchoDeCelular() {
  if (typeof window === 'undefined') return true; // si no se sabe, mejor no actuar como receptor
  return window.matchMedia(`(max-width: ${ANCHO_MAXIMO_CELULAR}px)`).matches;
}

export default function PanicoReceptor() {
  const [esCelular, setEsCelular] = useState(esAnchoDeCelular);
  const [activo, setActivo] = useState(false);
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [claveConfigurada, setClaveConfigurada] = useState(true);
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [verificando, setVerificando] = useState(false);
  const toquesRef = useRef([]);

  // Si la ventana cambia de ancho (alguien achica la ventana del
  // computador, o gira una tablet), se vuelve a evaluar cuál rol le toca.
  useEffect(() => {
    function alCambiarTamano() {
      setEsCelular(esAnchoDeCelular());
    }
    window.addEventListener('resize', alCambiarTamano);
    return () => window.removeEventListener('resize', alCambiarTamano);
  }, []);

  useEffect(() => {
    if (esCelular) return; // en celular, este componente no hace nada — ver PanicoBoton.js
    let cancelado = false;

    async function consultar() {
      try {
        const res = await fetch('/api/panico/estado');
        const data = await res.json();
        if (!cancelado && data.ok) setActivo(data.activo);
      } catch {
        // Si falla una consulta, se reintenta sola en la siguiente — no
        // cambia el estado actual por un error de red pasajero.
      }
    }

    consultar();
    const intervalo = setInterval(consultar, INTERVALO_CONSULTA_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [esCelular]);

  // Bloquea el scroll de fondo mientras está tapada, y le quita el foco a
  // cualquier campo que hubiera quedado seleccionado.
  useEffect(() => {
    if (!activo || esCelular) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflowPrevio;
    };
  }, [activo, esCelular]);

  useEffect(() => {
    if (esCelular) return;
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
  }, [esCelular, activo]);

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
        await fetch('/api/panico/estado', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activo: false }),
        });
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

  if (esCelular || !activo) return null;

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
              Todavía no has configurado una clave en Configuraciones → Seguridad, así que cualquiera puede quitar
              esto con solo dejar el campo vacío y continuar. Ve a configurarla apenas puedas.
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

const styles = {
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
    width: '280px',
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
