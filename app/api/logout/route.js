import { NextResponse } from 'next/server';
import { COOKIE_SESION, OPCIONES_COOKIE } from '../../../lib/sesion';

// Cerrar sesión: borra la cookie de sesión y manda a la pantalla de login.
// El botón "Cerrar sesión" del menú lateral apunta a /api/logout, pero esta
// ruta no existía — por eso el botón no cerraba nada.
function cerrarSesion(request) {
  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.set(COOKIE_SESION, '', { ...OPCIONES_COOKIE, maxAge: 0 });
  response.cookies.set('pos_clave', '', { ...OPCIONES_COOKIE, maxAge: 0 });
  return response;
}

export async function GET(request) {
  return cerrarSesion(request);
}

export async function POST(request) {
  return cerrarSesion(request);
}
