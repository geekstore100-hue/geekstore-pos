import { NextResponse } from 'next/server';
import { COOKIE_SESION, tokenSesionValido } from './lib/sesion';

// Rutas públicas, sin necesidad de tener la sesión de administrador
// iniciada:
// - /login, /api/login: la propia pantalla/endpoint de inicio de sesión.
// - /api/logout: cerrar sesión debe funcionar siempre, aunque la sesión ya
//   esté vencida.
// - /api/publico: el catálogo público que usa la tienda (geekstore-tienda)
//   para leer productos, precios y stock (ver app/api/publico/catalogo).
// - /api/imagenes: las fotos de los productos que ese mismo catálogo
//   referencia — si esta ruta quedara protegida, el catálogo respondería
//   bien pero las fotos no cargarían en la tienda.
// - /_next y favicon.ico: recursos internos de Next.js.
function esRutaPublica(pathname) {
  return (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/login') ||
    pathname.startsWith('/api/logout') ||
    pathname.startsWith('/api/publico') ||
    pathname.startsWith('/api/imagenes') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  );
}

const METODOS_SOLO_LECTURA = ['GET', 'HEAD', 'OPTIONS'];

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Protección contra ataques desde otras páginas (CSRF): si estás con la
  // sesión abierta y visitas una página maliciosa, esa página podría
  // intentar mandarle órdenes a tu POS (registrar, anular, borrar...) a
  // nombre tuyo. Los navegadores modernos marcan cada petición con
  // "Sec-Fetch-Site"; si una petición que MODIFICA datos viene de otro
  // sitio web ("cross-site"), se rechaza. Las rutas /api/publico quedan por
  // fuera porque las llama el servidor de la tienda, no un navegador.
  if (!METODOS_SOLO_LECTURA.includes(request.method) && !pathname.startsWith('/api/publico')) {
    if (request.headers.get('sec-fetch-site') === 'cross-site') {
      return NextResponse.json({ ok: false, error: 'Solicitud bloqueada' }, { status: 403 });
    }
  }

  if (esRutaPublica(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_SESION)?.value;
  if (!(await tokenSesionValido(token))) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

// api/imagenes/ también queda por fuera del middleware: las fotos ya eran
// públicas (ver esRutaPublica arriba) y esa ruta solo acepta GET, así que
// el middleware no hacía nada con ellas — pero igual se ejecutaba una vez
// por CADA foto que se cargaba (hasta 60 de golpe al abrir Vender, más
// todas las que pide la tienda), gastando ejecuciones en Netlify para nada.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/imagenes/).*)'],
};
