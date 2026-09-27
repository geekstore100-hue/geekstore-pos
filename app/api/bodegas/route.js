import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

// Lista las bodegas del sistema (Principal, Bodega Distribuidor, Garantías
// con Proveedor, etc.) para los selectores de Ajustes de inventario,
// Reabastecimiento, Facturas de compra y Garantías a proveedor.
export async function GET() {
  try {
    const bodegas = await sql`SELECT id, nombre FROM bodegas ORDER BY nombre ASC`;
    return NextResponse.json({ ok: true, bodegas });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
