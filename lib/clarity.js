import sql from './db';

// Microsoft Clarity (octubre 2026): resumen de cómo navegan los clientes en
// geekstore.com.co (visitas, errores de la página, clics de rabia, páginas
// más vistas...). Los VIDEOS se ven en clarity.microsoft.com (Clarity no
// deja mostrarlos dentro de otra página); el POS solo pone los botones.
//
// API de exportación de Clarity:
//   GET https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=1|2|3
//   Authorization: Bearer <token>
// Límite: 10 consultas por proyecto al día y solo los últimos 1 a 3 días.
// Por eso el resultado se guarda en la tabla "configuracion" y se vuelve a
// pedir como máximo cada 6 horas (por cada rango: 24 h y 3 días = máx. 8
// consultas al día).
//
// Variables (Netlify, sitio del POS):
//   CLARITY_API_TOKEN   — Clarity → Configuración → Exportación de datos → Generar token
//   CLARITY_PROJECT_ID  — opcional (por defecto el de geekstore.com.co)

export const CLARITY_PROJECT_ID = (process.env.CLARITY_PROJECT_ID || 'z229bsjzf0').replace(/[^A-Za-z0-9]/g, '');
const CADA = 6 * 60 * 60 * 1000;

async function leerCache(clave) {
  try {
    const [fila] = await sql`SELECT valor FROM configuracion WHERE clave = ${clave}`;
    return fila?.valor ? JSON.parse(fila.valor) : null;
  } catch {
    return null;
  }
}

async function guardarCache(clave, valor) {
  const texto = JSON.stringify(valor);
  await sql`
    INSERT INTO configuracion (clave, valor, actualizado_en)
    VALUES (${clave}, ${texto}, NOW())
    ON CONFLICT (clave) DO UPDATE SET valor = ${texto}, actualizado_en = NOW()
  `;
}

export async function resumenClarity({ dias = 1, forzar = false } = {}) {
  const n = [1, 2, 3].includes(Number(dias)) ? Number(dias) : 1;
  const clave = `clarity_resumen_${n}`;
  const cache = await leerCache(clave);
  const token = process.env.CLARITY_API_TOKEN;
  const fresco = cache?.en && Date.now() - cache.en < CADA;
  // "forzar" solo si la copia tiene más de 30 minutos (para no gastar el
  // límite diario de Clarity tocando el botón varias veces).
  const puedeForzar = forzar && cache?.en && Date.now() - cache.en > 30 * 60 * 1000;
  if (!token) return { ok: false, sinToken: true, cache };
  if (cache?.datos && fresco && !puedeForzar) return { ok: true, ...cache, desdeCache: true };

  try {
    const res = await fetch(`https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=${n}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined,
    });
    if (!res.ok) {
      const texto = await res.text().catch(() => '');
      const motivo =
        res.status === 401 || res.status === 403
          ? 'Clarity no aceptó el token (CLARITY_API_TOKEN). Genera uno nuevo en Clarity → Configuración → Exportación de datos.'
          : res.status === 429
            ? 'Ya se usaron las 10 consultas del día que permite Clarity. Se muestra la última copia guardada.'
            : `Clarity respondió ${res.status}: ${texto.slice(0, 150)}`;
      if (cache?.datos) return { ok: true, ...cache, desdeCache: true, aviso: motivo };
      return { ok: false, error: motivo };
    }
    const datos = await res.json();
    const valor = { en: Date.now(), dias: n, datos: Array.isArray(datos) ? datos : [] };
    await guardarCache(clave, valor).catch(() => {});
    return { ok: true, ...valor };
  } catch (e) {
    if (cache?.datos) return { ok: true, ...cache, desdeCache: true, aviso: `No se pudo actualizar: ${e.message}` };
    return { ok: false, error: e.message };
  }
}
