import { generarRespaldo } from '../../lib/respaldo';

// Respaldo automático y diario de la base de datos (ver lib/respaldo.js
// para el detalle de qué hace y por qué). Netlify corre esto solo, todos
// los días, a la hora de "schedule" de abajo — no hace falta que nadie
// entre a activarlo ni a programarlo en ningún lado aparte de subir este
// archivo (y netlify.toml, que le dice a Netlify dónde buscarlo).
export default async () => {
  try {
    const resultado = await generarRespaldo();
    console.log(`Respaldo generado: ${resultado.key} (${resultado.tablas} tablas, ${resultado.tamanoBytes} bytes)`);
    return new Response('ok');
  } catch (error) {
    console.error('Error generando el respaldo programado:', error);
    // No relanza el error: no hay quién reciba una alerta en caliente de
    // todos modos, y sí queda el registro en los "Function logs" de
    // Netlify por si un día hay que revisar por qué falló uno puntual. Al
    // día siguiente se vuelve a intentar solo.
    return new Response('error', { status: 500 });
  }
};

export const config = {
  schedule: '0 8 * * *', // todos los días, 8:00 UTC = 3:00 a.m. hora Bogotá
};
