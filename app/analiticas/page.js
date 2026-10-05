'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import AnaliticasTienda from '../../components/AnaliticasTienda';

// Octubre 2026: la sección tiene dos pestañas:
//   - "Tienda online" (por defecto): estadísticas propias de geekstore.com.co
//     (components/AnaliticasTienda.js).
//   - "Google Analytics": el reporte de Looker Studio de antes (abajo).
//
// Pestaña Google Analytics: en vez de reconstruir un dashboard de Google
// Analytics 4 desde cero (eso exigiría crear un proyecto en Google Cloud,
// una cuenta de servicio y guardar credenciales — mucho más trabajo y
// mantenimiento para un beneficio similar), se embebe un reporte hecho en
// Looker Studio (gratis, de Google, conectado directo a la propiedad de
// GA4 que ya está instalada en geekstore.com.co). Una sola vez se crea el
// reporte y se pega el enlace acá; después queda disponible siempre en
// esta pantalla, sin volver a tocar nada.
function GoogleAnalyticsLooker() {
  const [urlEmbed, setUrlEmbed] = useState('');
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [urlEdicion, setUrlEdicion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/configuracion/analiticas')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setUrlEmbed(d.urlEmbed || '');
          setUrlEdicion(d.urlEmbed || '');
          if (!d.urlEmbed) setEditando(true);
        }
      })
      .finally(() => setCargando(false));
  }, []);

  async function guardar(e) {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      const res = await fetch('/api/configuracion/analiticas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urlEmbed: urlEdicion.trim() }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'No se pudo guardar el enlace');
        return;
      }
      setUrlEmbed(data.urlEmbed);
      setEditando(false);
    } catch {
      setError('Error de conexión al guardar');
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return (
      <>
        <p>Cargando...</p>
      </>
    );
  }

  return (
    <>
      {editando ? (
        <div style={styles.tarjeta}>
          <p style={{ marginTop: 0 }}>
            La tienda ya tiene instalado Google Analytics 4 (mide todas las visitas, productos vistos y ventas de
            geekstore.com.co). Para verlo aquí, en un reporte fácil de entender, sin tener que crear ninguna cuenta de
            Google Cloud ni programar nada:
          </p>
          <ol style={{ paddingLeft: '20px', lineHeight: 1.8 }}>
            <li>
              Entra a{' '}
              <a href="https://lookerstudio.google.com" target="_blank" rel="noopener noreferrer">
                lookerstudio.google.com
              </a>{' '}
              con la cuenta de Google que administra Analytics de Geek Store.
            </li>
            <li>Clic en &quot;Crear&quot; → &quot;Informe&quot;, y elige como fuente de datos &quot;Google Analytics&quot; → la propiedad de geekstore.com.co (GA4).</li>
            <li>
              Puedes usar la plantilla que Google sugiere automáticamente (resumen de visitas, páginas más vistas,
              de dónde vienen los visitantes, etc.) — se puede personalizar después, pero para empezar sirve tal cual.
            </li>
            <li>
              Arriba a la derecha: &quot;Compartir&quot; → &quot;Insertar informe&quot; (Embed report). Actívalo y copia el enlace que
              te da (empieza con <code>https://lookerstudio.google.com/embed/...</code>).
            </li>
            <li>Pega ese enlace acá abajo y guarda.</li>
          </ol>
          <form onSubmit={guardar} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
            <input
              value={urlEdicion}
              onChange={(e) => setUrlEdicion(e.target.value)}
              placeholder="https://lookerstudio.google.com/embed/reporting/..."
              style={{ ...styles.input, flex: 1, minWidth: '280px' }}
            />
            <button type="submit" disabled={guardando} style={styles.btnPrimario}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
            {urlEmbed && (
              <button type="button" onClick={() => { setEditando(false); setUrlEdicion(urlEmbed); setError(''); }} style={styles.btnSecundario}>
                Cancelar
              </button>
            )}
          </form>
          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
            <button onClick={() => setEditando(true)} style={styles.btnSecundario}>Cambiar enlace del reporte</button>
          </div>
          <div style={styles.contenedorIframe}>
            <iframe
              src={urlEmbed}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="Reporte de Analíticas"
            />
          </div>
        </>
      )}
    </>
  );
}

export default function AnaliticasPage() {
  const [pestana, setPestana] = useState('tienda');
  return (
    <Shell title="Analíticas">
      <div style={{ display: 'flex', gap: '4px', borderBottom: '2px solid var(--border)', marginBottom: '16px' }}>
        {[
          ['tienda', 'Tienda online'],
          ['google', 'Google Analytics'],
        ].map(([id, nombre]) => (
          <button
            key={id}
            onClick={() => setPestana(id)}
            style={{
              padding: '9px 16px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: pestana === id ? 700 : 500,
              color: pestana === id ? 'var(--teal-dark)' : 'var(--text-secondary)',
              borderBottom: pestana === id ? '2px solid var(--teal-dark)' : '2px solid transparent',
              marginBottom: '-2px',
            }}
          >
            {nombre}
          </button>
        ))}
      </div>
      {pestana === 'tienda' ? <AnaliticasTienda /> : <GoogleAnalyticsLooker />}
    </Shell>
  );
}

const styles = {
  tarjeta: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px 20px', maxWidth: '720px' },
  input: { padding: '9px', borderRadius: '8px', border: '1px solid var(--border)' },
  btnPrimario: { padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  btnSecundario: { padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', color: 'var(--text)', cursor: 'pointer', fontWeight: 600 },
  contenedorIframe: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', height: 'calc(100vh - 180px)', minHeight: '500px' },
};
