import { NextResponse } from 'next/server';

// Rutas públicas, sin necesidad de tener la sesión de administrador
// iniciada:
// - /login, /api/login: la propia pantalla/endpoint de inicio de sesión.
// - /api/publico: el catálogo público que usa la tienda (geekstore-tienda)
//   para leer productos, precios y stock (ver app/api/publico/catalogo).
// - /api/imagenes: las fotos de los productos que ese mismo catálogo
//   referencia — si esta ruta quedara protegida, el catálogo respondería
//   bien pero las fotos no cargarían en la tienda.
// - /_next y favicon.ico: recursos internos de Next.js.
export function middleware(request) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/login') ||
    pathname.startsWith('/api/publico') ||
    pathname.startsWith('/api/imagenes') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get('pos_clave');

  if (!cookie || cookie.value !== process.env.ADMIN_CLAVE) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
