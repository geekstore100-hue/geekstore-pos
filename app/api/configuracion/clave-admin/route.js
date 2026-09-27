import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { hashClave, verificarClave } from '../../../../lib/claveAdmin';
import { ipDe, minutosBloqueado, registrarFallo, limpiarFallos } from '../../../../lib/limiteIntentos';

// Dice si ya hay una clave de administrador configurada (nunca devuelve la
// clave ni su hash).
export async function GET() {
  try {
    const [fila] = await sql`SELECT valor FROM configuracion WHERE clave = 'clave_administrador'`;
    return NextResponse.json({ ok: true, configurada: Boolean(fila?.valor) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Crea o cambia la clave de administrador. Si ya había una, hay que dar la
// clave actual correcta para poder cambiarla.
export async function POST(request) {
  try {
    const body = await request.json();
    const claveActual = body.clave_actual || '';
    const claveNueva = body.clave_nueva || '';

    if (!claveNueva || claveNueva.trim().length < 4) {
      return NextResponse.json({ ok: false, error: 'La clave nueva debe tener al menos 4 caracteres' }, { status: 400 });
    }

    const [fila] = await sql`SELECT valor FROM configuracion WHERE clave = 'clave_administrador'`;

    // Mismo límite de intentos que al verificar la clave (ver
    // verificar/route.js): si no, este formulario serviría para adivinar
    // la clave actual probando sin límite.
    if (fila?.valor) {
      const llaveLimite = `admin:${ipDe(request)}`;
      const minutos = await minutosBloqueado(llaveLimite);
      if (minutos > 0) {
        return NextResponse.json(
          { ok: false, error: `Demasiados intentos fallidos. Espera ${minutos} minuto${minutos === 1 ? '' : 's'} e intenta de nuevo.` },
          { status: 429 }
        );
      }
      if (!verificarClave(claveActual, fila.valor)) {
        await registrarFallo(llaveLimite);
        return NextResponse.json({ ok: false, error: 'La clave actual no es correcta' }, { status: 403 });
      }
      await limpiarFallos(llaveLimite);
    }

    const nuevoValor = hashClave(claveNueva.trim());
    await sql`
      INSERT INTO configuracion (clave, valor, actualizado_en)
      VALUES ('clave_administrador', ${nuevoValor}, now())
      ON CONFLICT (clave) DO UPDATE SET valor = ${nuevoValor}, actualizado_en = now()
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
