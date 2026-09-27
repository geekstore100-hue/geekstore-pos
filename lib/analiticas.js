import sql from './db';

// Enlace del reporte de Analíticas (Looker Studio conectado a Google
// Analytics 4) que se embebe en /analiticas. Se guarda en la tabla
// genérica "configuracion" (mismo patrón que datos_empresa):
//   clave = 'analiticas'
//   valor = {"urlEmbed": "https://lookerstudio.google.com/embed/reporting/..."}
// Si nunca se ha configurado, llega vacío y la página muestra las
// instrucciones para crear el reporte en Looker Studio y pegar el enlace.

export async function leerUrlAnaliticas() {
  try {
    const [fila] = await sql`SELECT valor FROM configuracion WHERE clave = 'analiticas'`;
    if (!fila?.valor) return '';
    const v = JSON.parse(fila.valor);
    return v.urlEmbed || '';
  } catch {
    return '';
  }
}

export async function guardarUrlAnaliticas(urlEmbed) {
  const url = String(urlEmbed || '').trim();
  const valor = JSON.stringify({ urlEmbed: url });
  await sql`
    INSERT INTO configuracion (clave, valor, actualizado_en)
    VALUES ('analiticas', ${valor}, NOW())
    ON CONFLICT (clave) DO UPDATE SET valor = ${valor}, actualizado_en = NOW()
  `;
  return url;
}
