import { NextResponse } from 'next/server';
import {
  COOKIE_SESION,
  DURACION_SESION_SEG,
  OPCIONES_COOKIE,
  claveAccesoCorrecta,
  crearTokenSesion,
} from '../../../lib/sesion';
import { ipDe, minutosBloqueado, registrarFallo, limpiarFallos } from '../../../lib/limiteIntentos';

// Inicio de sesión del POS. Cambios de seguridad frente a la versión
// anterior:
// - La cookie ya NO guarda la clave: guarda un pase firmado que vence en 30
//   días (ver lib/sesion.js).
// - Después de 5 intentos fallidos en 15 minutos desde la misma conexión,
//   se bloquea esa conexión por 15 minutos (ver lib/limiteIntentos.js).
// - La clave se compara sin filtrar pistas por el tiempo de respuesta.
// - Si ADMIN_CLAVE no está configurada en Netlify, nadie puede entrar
//   (antes, en ese caso, una petición sin clave podía pasar).
export async function POST(request) {
  try {
    if (!process.env.ADMIN_CLAVE) {
      return NextResponse.json(
        { ok: false, error: 'El sistema no tiene configurada la clave de acceso (ADMIN_CLAVE en Netlify)' },
        { status: 500 }
      );
    }

    const llaveLimite = `login:${ipDe(request)}`;
    const minutos = await minutosBloqueado(llaveLimite);
    if (minutos > 0) {
      return NextResponse.json(
        { ok: false, error: `Demasiados intentos fallidos. Espera ${minutos} minuto${minutos === 1 ? '' : 's'} e intenta de nuevo.` },
        { status: 429 }
      );
    }

    let clave = '';
    try {
      ({ clave } = await request.json());
    } catch {
      clave = '';
    }

    if (!(await claveAccesoCorrecta(clave))) {
      await registrarFallo(llaveLimite);
      return NextResponse.json({ ok: false, error: 'Clave incorrecta' }, { status: 401 });
    }

    await limpiarFallos(llaveLimite);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(COOKIE_SESION, await crearTokenSesion(), {
      ...OPCIONES_COOKIE,
      maxAge: DURACION_SESION_SEG,
    });
    // Borra la cookie vieja (la que guardaba la clave tal cual), si quedó.
    response.cookies.set('pos_clave', '', { ...OPCIONES_COOKIE, maxAge: 0 });
    return response;
  } catch {
    return NextResponse.json({ ok: false, error: 'No se pudo iniciar sesión' }, { status: 500 });
  }
}
