import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';

// Cambiar el NOMBRE de varios productos de una vez (lo usa la revisión de
// nombres con IA, después de que Nelson aprueba las sugerencias). Todo en
// una sola transacción: o se guardan todos o ninguno.
//
// También guarda las "palabras correctas" (marcas o modelos que la IA cree
// mal escritos pero están bien), para que no las vuelva a sugerir.

export async function POST(request) {
  try {
    const body = await request.json();

    if (Array.isArray(body.palabrasCorrectas)) {
      const limpias = [...new Set(body.palabrasCorrectas.map((w) => String(w || '').trim()).filter((w) => w && w.length <= 40))].slice(0, 300);
      const valor = JSON.stringify(limpias);
      await sql`
        INSERT INTO configuracion (clave, valor, actualizado_en)
        VALUES ('nombres_palabras_ok', ${valor}, now())
        ON CONFLICT (clave) DO UPDATE SET valor = ${valor}, actualizado_en = now()
      `;
      return NextResponse.json({ ok: true, palabrasCorrectas: limpias });
    }

    const cambios = Array.isArray(body.cambios) ? body.cambios : [];
    const validos = [];
    for (const c of cambios) {
      const id = Number(c?.id);
      const nombre = String(c?.nombre || '').replace(/\s+/g, ' ').trim();
      if (!id || nombre.length < 3 || nombre.length > 150) {
        return NextResponse.json({ ok: false, error: 'Hay un nombre vacío o demasiado largo' }, { status: 400 });
      }
      validos.push({ id, nombre });
    }
    if (validos.length === 0) {
      return NextResponse.json({ ok: false, error: 'No hay cambios para guardar' }, { status: 400 });
    }
    await sql.transaction(
      validos.map((c) => sql`UPDATE productos SET nombre = ${c.nombre}, actualizado_en = now() WHERE id = ${c.id}`)
    );
    return NextResponse.json({ ok: true, actualizados: validos.length });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const [fila] = await sql`SELECT valor FROM configuracion WHERE clave = 'nombres_palabras_ok'`;
    const lista = fila?.valor ? JSON.parse(fila.valor) : [];
    return NextResponse.json({ ok: true, palabrasCorrectas: Array.isArray(lista) ? lista : [] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
