import { NextResponse } from 'next/server';
import sql from '../../../../../lib/db';
import { verificarClave } from '../../../../../lib/claveAdmin';
import { ipDe, minutosBloqueado, registrarFallo, limpiarFallos } from '../../../../../lib/limiteIntentos';

// Verifica una clave contra la de administrador guardada. Se usa para
// desbloquear pantallas restringidas (por ahora, Ajustes de inventario).
//
// Límite de intentos: después de 5 claves incorrectas en 15 minutos desde
// la misma conexión, se bloquea por 15 minutos (antes se podía probar sin
// límite, y como la clave puede ser de solo 4 caracteres, se podía adivinar
// en pocos minutos). La consulta con clave vacía que hace la pantalla al
// abrir (para saber si hay clave configurada) NO cuenta como intento
// fallido.
export async function POST(request) {
  try {
    const body = await request.json();
    const clave = body.clave || '';

    const [fila] = await sql`SELECT valor FROM configuracion WHERE clave = 'clave_administrador'`;

    if (!fila?.valor) {
      // No hay clave configurada todavía: no se bloquea nada.
      return NextResponse.json({ ok: true, valida: true, configurada: false });
    }

    if (!clave) {
      return NextResponse.json({ ok: true, valida: false, configurada: true });
    }

    const llaveLimite = `admin:${ipDe(request)}`;
    const minutos = await minutosBloqueado(llaveLimite);
    if (minutos > 0) {
      return NextResponse.json({
        ok: true,
        valida: false,
        configurada: true,
        error: `Demasiados intentos fallidos. Espera ${minutos} minuto${minutos === 1 ? '' : 's'} e intenta de nuevo.`,
      });
    }

    const valida = verificarClave(clave, fila.valor);
    if (valida) await limpiarFallos(llaveLimite);
    else await registrarFallo(llaveLimite);

    return NextResponse.json({ ok: true, valida, configurada: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
