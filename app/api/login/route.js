import { NextResponse } from 'next/server';

export async function POST(request) {
  const { clave } = await request.json();

  if (clave !== process.env.ADMIN_CLAVE) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('pos_clave', clave, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
