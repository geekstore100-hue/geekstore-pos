import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { leerConfigArqueo } from '../../../../lib/configArqueo';
import { instanteHoyColombia } from '../../../../lib/horaColombia';

// ¿Toca pedir el arqueo de caja programado ahora mismo? Sí, cuando:
// - está activado en Configuraciones > Caja,
// - hay un turno abierto,
// - ya pasó la hora configurada de hoy (hora Colombia),
// - el turno se abrió ANTES de esa hora (si se abrió después, acaban de
//   contar la base y no tiene sentido pedirlo), y
// - todavía no se ha hecho ningún arqueo en este turno desde esa hora.
// La pantalla de Vender consulta esto cada minuto.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const config = await leerConfigArqueo();
    if (!config.activo) return NextResponse.json({ ok: true, pendiente: false, ...config });

    const [turno] = await sql`SELECT id, abierto_en FROM turnos WHERE estado = 'abierto' LIMIT 1`;
    if (!turno) return NextResponse.json({ ok: true, pendiente: false, ...config });

    const [h, m] = config.hora.split(':').map(Number);
    const limite = instanteHoyColombia(h, m);
    if (Date.now() < limite.getTime() || new Date(turno.abierto_en).getTime() >= limite.getTime()) {
      return NextResponse.json({ ok: true, pendiente: false, ...config });
    }

    const [hecho] = await sql`
      SELECT id FROM arqueos_caja
      WHERE turno_id = ${turno.id} AND creado_en >= ${limite.toISOString()}
      LIMIT 1
    `;
    return NextResponse.json({ ok: true, pendiente: !hecho, ...config });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
