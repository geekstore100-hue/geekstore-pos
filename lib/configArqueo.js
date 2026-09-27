import sql from './db';

// Configuración del arqueo de caja programado (Configuraciones > Caja). Se
// guarda en la tabla genérica "configuracion" como JSON:
//   clave = 'hora_arqueo', valor = {"activo": true, "hora": "14:00"}
// Si nunca se ha configurado, queda desactivado.

export const HORA_POR_DEFECTO = '14:00';

export function horaValida(hora) {
  return typeof hora === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(hora);
}

export async function leerConfigArqueo() {
  const [fila] = await sql`SELECT valor FROM configuracion WHERE clave = 'hora_arqueo'`;
  if (!fila?.valor) return { activo: false, hora: HORA_POR_DEFECTO };
  try {
    const v = JSON.parse(fila.valor);
    return { activo: Boolean(v.activo), hora: horaValida(v.hora) ? v.hora : HORA_POR_DEFECTO };
  } catch {
    return { activo: false, hora: HORA_POR_DEFECTO };
  }
}
