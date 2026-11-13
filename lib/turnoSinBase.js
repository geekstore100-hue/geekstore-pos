import sql from './db';

// "Dinero esperado en caja" SIN la base (nov 2026, pedido de Nelson).
// Antes: base inicial + ventas en efectivo - devoluciones - gastos de la caja.
// Ahora, en el CIERRE: ventas en efectivo - devoluciones - gastos de la caja
// (la base se queda en la caja para el día siguiente y no se cuenta). Los
// arqueos a mitad del turno siguen contando TODO el efectivo (con la base).
//
// Para no dañar las cuentas de los turnos que ya se cerraron con la regla
// vieja (donde se contó la base), cada turno lleva la marca
// esperado_sin_base: los nuevos (y el que esté abierto al publicar este
// cambio) la tienen en true; los viejos quedan en false y se ven igual que
// antes.
let listo = null;
export function asegurarTurnoSinBase() {
  if (!listo) {
    listo = (async () => {
      await sql`ALTER TABLE turnos ADD COLUMN IF NOT EXISTS esperado_sin_base boolean NOT NULL DEFAULT false`;
      await sql`UPDATE turnos SET esperado_sin_base = true WHERE estado = 'abierto' AND esperado_sin_base = false`;
    })().catch((e) => {
      listo = null;
      throw e;
    });
  }
  return listo;
}

// Lo que debería haber en la caja al cerrar, según la marca del turno.
export function dineroEsperadoTurno({ sinBase, baseInicial, ventasEfectivo, devolucionDinero, gastosCaja }) {
  const movimiento = Number(ventasEfectivo || 0) - Number(devolucionDinero || 0) - Number(gastosCaja || 0);
  return sinBase ? movimiento : Number(baseInicial || 0) + movimiento;
}
