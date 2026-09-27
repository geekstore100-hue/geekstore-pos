import { NextResponse } from 'next/server';
import sql from '../../../lib/db';

// Parámetros del análisis (ver conversación con Nelson para el porqué de
// estos valores):
// - VENTANA_DIAS: cuántos días de ventas se usan para calcular la velocidad
//   de venta promedio de cada producto.
// - UMBRAL_DIAS_COBERTURA: si al ritmo de venta actual el stock de Principal
//   alcanza para menos de estos días, se marca como "por agotarse pronto".
//   Nelson pidió que el sistema se anticipe 15 días, así que el umbral y el
//   objetivo de cobertura quedan iguales: se marca en cuanto la cobertura
//   proyectada baja a 15 días, y al sugerir traslado se repone hasta ahí.
// - OBJETIVO_DIAS_COBERTURA: cuando se sugiere trasladar desde Distribuidor,
//   se sugiere una cantidad que alcance a cubrir este número de días.
const VENTANA_DIAS = 30;
const UMBRAL_DIAS_COBERTURA = 15;
const OBJETIVO_DIAS_COBERTURA = 15;

export async function GET() {
  try {
    const filas = await sql`
      WITH ventas_periodo AS (
        SELECT m.producto_id, SUM(m.cantidad) AS unidades
        FROM movimientos_stock m
        JOIN ventas v ON v.id = m.venta_id
        WHERE m.tipo = 'venta'
          AND v.anulada = false
          -- Debe coincidir con VENTANA_DIAS de arriba (no se puede
          -- parametrizar un INTERVAL literal con el driver de Neon).
          AND v.creado_en >= now() - INTERVAL '30 days'
        GROUP BY m.producto_id
      ),
      stock_por_producto AS (
        SELECT
          s.producto_id,
          COALESCE(SUM(s.cantidad) FILTER (WHERE b.nombre = 'Principal'), 0) AS stock_principal,
          COALESCE(SUM(s.cantidad) FILTER (WHERE b.nombre = 'Bodega Distribuidor'), 0) AS stock_distribuidor
        FROM stock s
        JOIN bodegas b ON b.id = s.bodega_id
        GROUP BY s.producto_id
      )
      SELECT
        p.id,
        p.referencia,
        p.nombre,
        p.imagen_key,
        p.precio_costo,
        COALESCE(sp.stock_principal, 0) AS stock_principal,
        COALESCE(sp.stock_distribuidor, 0) AS stock_distribuidor,
        COALESCE(vp.unidades, 0) AS unidades_vendidas
      FROM productos p
      LEFT JOIN stock_por_producto sp ON sp.producto_id = p.id
      LEFT JOIN ventas_periodo vp ON vp.producto_id = p.id
      WHERE p.activo = true AND p.es_inventariable = true
    `;

    const alertas = filas
      .map((p) => {
        const stockPrincipal = Number(p.stock_principal);
        const stockDistribuidor = Number(p.stock_distribuidor);
        const unidadesVendidas = Number(p.unidades_vendidas);
        const ventaDiariaPromedio = unidadesVendidas / VENTANA_DIAS;
        const diasCobertura = ventaDiariaPromedio > 0 ? stockPrincipal / ventaDiariaPromedio : null;

        // Si no hay ni una unidad en Principal ni en Distribuidor, aquí no
        // hay nada que trasladar: no se muestra (eso es un problema de
        // compra, no de traspaso entre bodegas).
        if (stockPrincipal <= 0 && stockDistribuidor <= 0) return null;

        let prioridad = null;
        if (stockPrincipal <= 0) {
          prioridad = 1; // ya agotado en Principal
        } else if (diasCobertura !== null && diasCobertura <= UMBRAL_DIAS_COBERTURA) {
          prioridad = 2; // se va a agotar pronto según su ritmo de venta
        }

        if (prioridad === null) return null; // sano, no se muestra

        const accion = stockDistribuidor > 0 ? 'trasladar' : 'comprar';

        let cantidadSugerida = null;
        let estimado = false;
        if (accion === 'trasladar') {
          if (ventaDiariaPromedio > 0) {
            cantidadSugerida = Math.max(1, Math.ceil(ventaDiariaPromedio * OBJETIVO_DIAS_COBERTURA) - stockPrincipal);
          } else {
            // Sin historial de ventas para calcular: se sugiere una cantidad
            // pequeña por defecto, dejando claro que es una estimación.
            cantidadSugerida = Math.min(stockDistribuidor, 5);
            estimado = true;
          }
          cantidadSugerida = Math.min(cantidadSugerida, stockDistribuidor);
        } else {
          // "comprar": mismo objetivo de cobertura, pero sin tope de stock de
          // Distribuidor (no hay de dónde trasladar). Se usa igual como
          // cantidad por defecto al mandarlo a la lista de compras — se
          // puede ajustar ahí antes de comprar.
          if (ventaDiariaPromedio > 0) {
            cantidadSugerida = Math.max(1, Math.ceil(ventaDiariaPromedio * OBJETIVO_DIAS_COBERTURA) - stockPrincipal);
          } else {
            cantidadSugerida = 5;
            estimado = true;
          }
        }

        return {
          id: p.id,
          referencia: p.referencia,
          nombre: p.nombre,
          imagen_key: p.imagen_key,
          precio_costo: Number(p.precio_costo) || 0,
          stock_principal: stockPrincipal,
          stock_distribuidor: stockDistribuidor,
          venta_diaria_promedio: ventaDiariaPromedio,
          dias_cobertura: diasCobertura,
          prioridad,
          accion,
          cantidad_sugerida: cantidadSugerida,
          estimado,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
        if (a.prioridad === 1) {
          if (a.accion !== b.accion) return a.accion === 'trasladar' ? -1 : 1;
          return b.stock_distribuidor - a.stock_distribuidor;
        }
        return (a.dias_cobertura ?? Infinity) - (b.dias_cobertura ?? Infinity);
      });

    // Para los que hay que comprar (no alcanza con trasladar de
    // Distribuidor), se busca de una sola vez cuál proveedor sale más
    // barato, con base en el ÚLTIMO precio que se le pagó a cada uno (no el
    // mínimo histórico — un precio de hace 2 años ya no sirve para decidir
    // hoy). Esto es lo que permite saber "dónde me sale más barato
    // comprarlo ahora mismo" sin tener que abrir cada producto uno por uno.
    const idsParaComprar = alertas.filter((a) => a.accion === 'comprar').map((a) => a.id);
    if (idsParaComprar.length > 0) {
      const mejores = await sql`
        WITH compras AS (
          SELECT m.id, m.producto_id, f.proveedor_id, pr.nombre AS proveedor_nombre,
                 m.precio_unitario, f.fecha_creacion
          FROM movimientos_stock m
          JOIN facturas_compra f ON f.id = m.factura_compra_id
          JOIN proveedores pr ON pr.id = f.proveedor_id
          WHERE m.tipo = 'factura_compra' AND m.producto_id = ANY(${idsParaComprar})
        ),
        ultimo_por_proveedor AS (
          SELECT DISTINCT ON (producto_id, proveedor_id)
            producto_id, proveedor_id, proveedor_nombre,
            precio_unitario AS ultimo_precio, fecha_creacion AS ultima_compra
          FROM compras
          ORDER BY producto_id, proveedor_id, fecha_creacion DESC, id DESC
        )
        SELECT DISTINCT ON (producto_id) producto_id, proveedor_id, proveedor_nombre, ultimo_precio, ultima_compra
        FROM ultimo_por_proveedor
        ORDER BY producto_id, ultimo_precio ASC, ultima_compra DESC
      `;
      const mejorPorProducto = new Map(mejores.map((m) => [m.producto_id, m]));
      for (const alerta of alertas) {
        if (alerta.accion === 'comprar') {
          const mejor = mejorPorProducto.get(alerta.id);
          alerta.mejor_proveedor = mejor
            ? {
                proveedor_id: mejor.proveedor_id,
                proveedor_nombre: mejor.proveedor_nombre,
                precio: Number(mejor.ultimo_precio),
                ultima_compra: mejor.ultima_compra,
              }
            : null;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      parametros: {
        ventana_dias: VENTANA_DIAS,
        umbral_dias_cobertura: UMBRAL_DIAS_COBERTURA,
        objetivo_dias_cobertura: OBJETIVO_DIAS_COBERTURA,
      },
      alertas,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
