import sql from './db';

// Tema visual de toda la aplicación (colores del menú, botones, resaltados).
// Es uno solo para toda la tienda (no por usuario) — se guarda en la misma
// tabla genérica "configuracion" (igual que la hora del arqueo o la IA):
//   clave = 'tema_visual'
//   valor = 'actual' | 'azul'

export const TEMA_DEF = 'actual';

function normalizarTema(t) {
  return t === 'azul' ? 'azul' : TEMA_DEF;
}

export async function leerTema() {
  try {
    const [fila] = await sql`SELECT valor FROM configuracion WHERE clave = 'tema_visual'`;
    return normalizarTema(fila?.valor);
  } catch {
    return TEMA_DEF;
  }
}

export async function guardarTema(tema) {
  const valor = normalizarTema(tema);
  await sql`
    INSERT INTO configuracion (clave, valor, actualizado_en)
    VALUES ('tema_visual', ${valor}, now())
    ON CONFLICT (clave) DO UPDATE SET valor = ${valor}, actualizado_en = now()
  `;
  return valor;
}
