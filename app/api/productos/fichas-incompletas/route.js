import { NextResponse } from 'next/server';
import sql from '../../../../lib/db';
import { tipoDeProducto, camposFaltantes } from '../../../../lib/plantillasFicha';

// Reporte "Fichas incompletas": productos activos que se muestran en la
// tienda y a los que les falta algún dato clave de su ficha técnica según
// su tipo (ver lib/plantillasFicha.js). Sin esos datos el chat de la tienda
// no puede saber si el producto le sirve a un cliente (ej. un cargador sin
// "Compatible con" ni "Incluye cable").
//
// Primero los que tienen stock (son los que se pueden vender ya) y, entre
// ellos, los que tienen más campos clave vacíos.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const filas = await sql`
      SELECT p.id, p.referencia, p.nombre,
             c.nombre AS categoria, sc.nombre AS subcategoria,
             (to_jsonb(p) -> 'especificaciones') AS especificaciones,
             COALESCE(SUM(s.cantidad), 0) AS stock
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      LEFT JOIN subcategorias sc ON sc.id = p.subcategoria_id
      LEFT JOIN stock s ON s.producto_id = p.id
      WHERE p.activo = true
        AND COALESCE((to_jsonb(p) ->> 'mostrar_en_tienda')::boolean, true) = true
      GROUP BY p.id, c.nombre, sc.nombre
    `;

    const productos = [];
    const porTipo = {};
    let completos = 0;
    for (const p of filas) {
      let specs = p.especificaciones;
      if (typeof specs === 'string') {
        try {
          specs = JSON.parse(specs);
        } catch {
          specs = [];
        }
      }
      if (!Array.isArray(specs)) specs = [];
      const plantilla = tipoDeProducto(p);
      const faltan = camposFaltantes(plantilla, specs);
      const faltanClave = faltan.filter((c) => c.clave).map((c) => c.nombre);
      const faltanOpcionales = faltan.filter((c) => !c.clave).map((c) => c.nombre);
      // La plantilla "general" no tiene campos clave: cuenta como incompleta
      // solo si no tiene NINGUNA especificación.
      const incompleta = faltanClave.length > 0 || specs.length === 0;
      if (!incompleta) {
        completos++;
        continue;
      }
      porTipo[plantilla.tipo] = porTipo[plantilla.tipo] || { tipo: plantilla.tipo, titulo: plantilla.titulo, cantidad: 0 };
      porTipo[plantilla.tipo].cantidad++;
      productos.push({
        id: p.id,
        referencia: p.referencia,
        nombre: p.nombre,
        categoria: p.categoria,
        tipo: plantilla.tipo,
        tipoTitulo: plantilla.titulo,
        stock: Number(p.stock) || 0,
        filas: specs.length,
        faltanClave,
        faltanOpcionales,
      });
    }
    productos.sort(
      (a, b) =>
        (b.stock > 0) - (a.stock > 0) ||
        b.faltanClave.length - a.faltanClave.length ||
        a.filas - b.filas ||
        String(a.nombre).localeCompare(String(b.nombre), 'es')
    );
    return NextResponse.json({
      ok: true,
      total: filas.length,
      completos,
      incompletos: productos.length,
      tipos: Object.values(porTipo).sort((a, b) => b.cantidad - a.cantidad),
      productos,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
