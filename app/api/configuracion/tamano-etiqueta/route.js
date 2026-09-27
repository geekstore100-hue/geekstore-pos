import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

// Tamaño físico de la etiqueta que se imprime desde /etiquetas (por defecto
// 74mm x 45mm). Se guarda como un solo valor JSON en la misma tabla
// genérica "configuracion" que ya usan el logo y la clave de administrador,
// para poder cambiarlo desde Ajustes sin tocar código — por ejemplo, si
// Nelson cambia de hojas de etiquetas a un tamaño distinto.
export const dynamic = 'force-dynamic';

const ANCHO_POR_DEFECTO = 74;
const ALTO_POR_DEFECTO = 45;
const MIN_MM = 10;
const MAX_MM = 300;

export async function GET() {
  try {
    const [fila] = await sql`SELECT valor FROM configuracion WHERE clave = 'tamano_etiqueta'`;
    if (!fila?.valor) {
      return NextResponse.json({ ok: true, ancho_mm: ANCHO_POR_DEFECTO, alto_mm: ALTO_POR_DEFECTO });
    }
    const datos = JSON.parse(fila.valor);
    return NextResponse.json({
      ok: true,
      ancho_mm: Number(datos.ancho_mm) || ANCHO_POR_DEFECTO,
      alto_mm: Number(datos.alto_mm) || ALTO_POR_DEFECTO,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const ancho = Number(body.ancho_mm);
    const alto = Number(body.alto_mm);
    if (!ancho || !alto || ancho < MIN_MM || alto < MIN_MM || ancho > MAX_MM || alto > MAX_MM) {
      return NextResponse.json(
        { ok: false, error: `El ancho y el alto deben estar entre ${MIN_MM}mm y ${MAX_MM}mm` },
        { status: 400 }
      );
    }
    const valor = JSON.stringify({ ancho_mm: ancho, alto_mm: alto });
    await sql`
      INSERT INTO configuracion (clave, valor, actualizado_en)
      VALUES ('tamano_etiqueta', ${valor}, now())
      ON CONFLICT (clave) DO UPDATE SET valor = ${valor}, actualizado_en = now()
    `;
    return NextResponse.json({ ok: true, ancho_mm: ancho, alto_mm: alto });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
