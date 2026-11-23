import { NextResponse } from 'next/server';
import sql from '../../../../../../lib/db';
import { validarBufferDocumento, TAMANO_MAXIMO } from '../../../../../../lib/validarDocumento';
import { guardarManifiesto, almacenPartes, TAMANO_PARTE } from '../../../../../../lib/manifiestosGuardar';

export const dynamic = 'force-dynamic';

// SUBIDA POR PARTES de un manifiesto grande (nov 2026: hasta 15 MB).
// Netlify no deja recibir más de ~6 MB en una petición, así que el
// navegador parte el archivo en pedazos de 4 MB (lib/manifiestoPartes.js):
//
//   POST ?subida=<id>&n=<0,1,2…>   cuerpo = los bytes de ese pedazo
//   POST ?subida=<id>&terminar=1   { partes, nombre } → junta, valida, guarda
//
// Los pedazos quedan aparte (store "manifiestos-partes") y se borran al
// terminar.

const ID_VALIDO = /^[a-z0-9-]{8,64}$/i;
const MAX_PARTES = Math.ceil(TAMANO_MAXIMO / TAMANO_PARTE);

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const subida = String(url.searchParams.get('subida') || '');
    if (!ID_VALIDO.test(subida)) return NextResponse.json({ ok: false, error: 'Subida inválida' }, { status: 400 });

    const [factura] = await sql`SELECT id, numero FROM facturas_compra WHERE id = ${id}`;
    if (!factura) return NextResponse.json({ ok: false, error: 'Factura de compra no encontrada' }, { status: 404 });
    const store = almacenPartes();
    const clave = (n) => `${factura.id}/${subida}/${n}`;

    if (url.searchParams.get('terminar') === '1') {
      const { partes, nombre } = await request.json().catch(() => ({}));
      const total = Number(partes);
      if (!Number.isInteger(total) || total < 1 || total > MAX_PARTES) {
        return NextResponse.json({ ok: false, error: 'Número de partes inválido' }, { status: 400 });
      }
      const pedazos = [];
      for (let n = 0; n < total; n++) {
        const p = await store.get(clave(n), { type: 'arrayBuffer' });
        if (!p) return NextResponse.json({ ok: false, error: `Falta la parte ${n + 1} de ${total}. Vuelve a subir el archivo.` }, { status: 409 });
        pedazos.push(new Uint8Array(p));
      }
      const largo = pedazos.reduce((a, p) => a + p.byteLength, 0);
      if (largo > TAMANO_MAXIMO) {
        await Promise.all(pedazos.map((_, n) => store.delete(clave(n)).catch(() => {})));
        return NextResponse.json({ ok: false, error: 'El archivo pesa más de 15 MB' }, { status: 413 });
      }
      const todo = new Uint8Array(largo);
      let pos = 0;
      for (const p of pedazos) {
        todo.set(p, pos);
        pos += p.byteLength;
      }
      const documento = validarBufferDocumento(todo.buffer, nombre);
      await Promise.all(pedazos.map((_, n) => store.delete(clave(n)).catch(() => {})));
      if (!documento.ok) return NextResponse.json({ ok: false, error: documento.error }, { status: 400 });
      const fila = await guardarManifiesto(factura, documento);
      return NextResponse.json({ ok: true, manifiesto: fila });
    }

    const n = Number(url.searchParams.get('n'));
    if (!Number.isInteger(n) || n < 0 || n >= MAX_PARTES) return NextResponse.json({ ok: false, error: 'Parte inválida' }, { status: 400 });
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > TAMANO_PARTE) {
      return NextResponse.json({ ok: false, error: 'Parte con tamaño inválido' }, { status: 400 });
    }
    await store.set(clave(n), bytes);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
