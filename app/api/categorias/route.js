import { NextResponse } from 'next/server';
import sql from '../../../lib/db';
import { choqueCategoria } from '../../../lib/nombresCategoria';

export async function GET() {
  try {
    // Con cuántos productos tiene cada una (nov 2026: para ver en
    // Configuraciones cuáles están repetidas o casi vacías).
    const categorias = await sql`
      SELECT c.id, c.nombre, (SELECT COUNT(*) FROM productos p WHERE p.categoria_id = c.id)::int AS productos
      FROM categorias c
      ORDER BY c.nombre ASC
    `;
    return NextResponse.json({ ok: true, categorias });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { nombre } = await request.json();

    if (!nombre || !nombre.trim()) {
      return NextResponse.json({ ok: false, error: 'El nombre de la categoría es obligatorio' }, { status: 400 });
    }

    // Nov 2026: no deja crear una categoría que ya existe con otra forma de
    // escribirla ("Videojuegos" / "Video Juegos") ni una que ya es
    // subcategoría ("Juegos PS4" está dentro de "Video Juegos").
    const [cats, subs] = await Promise.all([sql`SELECT id, nombre FROM categorias`, sql`SELECT id, categoria_id, nombre FROM subcategorias`]);
    const choque = choqueCategoria(nombre, cats, subs);
    if (choque) return NextResponse.json({ ok: false, error: choque }, { status: 409 });

    const [categoria] = await sql`
      INSERT INTO categorias (nombre)
      VALUES (${nombre.trim()})
      RETURNING id, nombre
    `;

    return NextResponse.json({ ok: true, categoria });
  } catch (error) {
    if (String(error.message).includes('duplicate key')) {
      return NextResponse.json({ ok: false, error: 'Ya existe una categoría con ese nombre' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
