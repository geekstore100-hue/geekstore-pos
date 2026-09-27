import sql from './db';

// Estado del botón de pánico: es COMPARTIDO (vive en la base de datos, no
// en el celular de cada quien), porque la idea es controlarlo a distancia
// — Nelson lo activa desde su celular (viendo las cámaras desde la casa,
// por ejemplo) y eso oculta la pantalla del computador de la tienda, sin
// tocar ese computador para nada. Mismo patrón de "configuracion" que ya
// se usa para analiticas, datos de la empresa, etc.
export async function leerEstadoPanico() {
  try {
    const [fila] = await sql`SELECT valor FROM configuracion WHERE clave = 'panico'`;
    if (!fila?.valor) return { activo: false, cambiadoEn: null };
    const v = JSON.parse(fila.valor);
    return { activo: Boolean(v.activo), cambiadoEn: v.cambiadoEn || null };
  } catch {
    return { activo: false, cambiadoEn: null };
  }
}

export async function guardarEstadoPanico(activo) {
  const cambiadoEn = new Date().toISOString();
  const valor = JSON.stringify({ activo: Boolean(activo), cambiadoEn });
  await sql`
    INSERT INTO configuracion (clave, valor, actualizado_en)
    VALUES ('panico', ${valor}, NOW())
    ON CONFLICT (clave) DO UPDATE SET valor = ${valor}, actualizado_en = NOW()
  `;
  return { activo: Boolean(activo), cambiadoEn };
}
