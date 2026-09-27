import sql from './db';

// Límite de intentos fallidos de clave (inicio de sesión y clave de
// administrador), para que nadie pueda "adivinar" la clave probando miles
// de combinaciones seguidas: después de 5 intentos fallidos en 15 minutos
// desde la misma conexión (IP), se bloquea esa conexión por 15 minutos.
//
// Si por algún motivo la tabla intentos_fallidos no existe todavía (no se
// corrió la migración de este lote) o la base de datos falla, estas
// funciones NO bloquean nada: es preferible que el límite deje de funcionar
// a que tú mismo te quedes por fuera del sistema.

const MAX_FALLOS = 5;

export function ipDe(request) {
  return (
    request.headers.get('x-nf-client-connection-ip') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'desconocida'
  );
}

// Devuelve cuántos minutos le quedan de bloqueo (0 si no está bloqueado).
export async function minutosBloqueado(llave) {
  try {
    const [fila] = await sql`
      SELECT CEIL(EXTRACT(EPOCH FROM (bloqueado_hasta - now())) / 60) AS minutos
      FROM intentos_fallidos
      WHERE clave = ${llave} AND bloqueado_hasta > now()
    `;
    return fila ? Math.max(1, Number(fila.minutos) || 1) : 0;
  } catch {
    return 0;
  }
}

export async function registrarFallo(llave) {
  try {
    const [fila] = await sql`
      INSERT INTO intentos_fallidos (clave, intentos, primer_intento)
      VALUES (${llave}, 1, now())
      ON CONFLICT (clave) DO UPDATE SET
        intentos = CASE
          WHEN intentos_fallidos.primer_intento < now() - interval '15 minutes' THEN 1
          ELSE intentos_fallidos.intentos + 1
        END,
        primer_intento = CASE
          WHEN intentos_fallidos.primer_intento < now() - interval '15 minutes' THEN now()
          ELSE intentos_fallidos.primer_intento
        END
      RETURNING intentos
    `;
    if (Number(fila?.intentos) >= MAX_FALLOS) {
      await sql`
        UPDATE intentos_fallidos SET bloqueado_hasta = now() + interval '15 minutes'
        WHERE clave = ${llave}
      `;
    }
  } catch {
    // Ver nota arriba: si falla, no se bloquea.
  }
}

export async function limpiarFallos(llave) {
  try {
    await sql`DELETE FROM intentos_fallidos WHERE clave = ${llave}`;
  } catch {
    // Ver nota arriba.
  }
}
