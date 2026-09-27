// Fechas y horas en hora de Colombia (UTC-5, sin horario de verano).
//
// Los servidores de Netlify y Neon trabajan en hora UTC (5 horas adelante),
// así que "hoy a las 2:00 p. m." o "el lunes de esta semana" hay que
// calcularlos a mano en hora colombiana; si no, por ejemplo, después de las
// 7:00 p. m. el servidor ya creería que es el día siguiente.

const DESFASE_MS = 5 * 60 * 60 * 1000;

export function fechaColombia(d = new Date()) {
  const c = new Date(d.getTime() - DESFASE_MS);
  return {
    anio: c.getUTCFullYear(),
    mes: c.getUTCMonth() + 1,
    dia: c.getUTCDate(),
    hora: c.getUTCHours(),
    minuto: c.getUTCMinutes(),
    diaSemana: c.getUTCDay(), // 0 = domingo, 1 = lunes...
  };
}

// El lunes de la semana actual, como 'AAAA-MM-DD'.
export function lunesDeLaSemana(d = new Date()) {
  const c = new Date(d.getTime() - DESFASE_MS);
  const diasDesdeLunes = (c.getUTCDay() + 6) % 7;
  const lunes = new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate() - diasDesdeLunes));
  return lunes.toISOString().slice(0, 10);
}

// El instante real (Date) que corresponde a "hoy a las HH:MM" en Colombia.
export function instanteHoyColombia(hora, minuto, d = new Date()) {
  const c = fechaColombia(d);
  return new Date(Date.UTC(c.anio, c.mes - 1, c.dia, hora, minuto) + DESFASE_MS);
}
