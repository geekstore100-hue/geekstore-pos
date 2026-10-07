// Bimestres del ReteICA en Bogotá: ene–feb, mar–abr, may–jun, jul–ago,
// sep–oct y nov–dic. Los usa /reteica para elegir el período de un clic
// (ej. "el certificado del bimestre anterior") y el PDF del certificado
// para decir "bimestre julio–agosto de 2026". El período se filtra por la
// FECHA DE LA FACTURA (fecha_creacion de la factura de compra, o la fecha
// de la factura en las retenciones sin factura de compra), no por el día
// en que se registró en el POS.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const dos = (n) => String(n).padStart(2, '0');

// n = 0..5 (0 = ene–feb)
export function bimestre(anio, n) {
  const mesInicio = n * 2 + 1; // 1, 3, 5...
  const ultimoDia = new Date(Date.UTC(anio, mesInicio + 1, 0)).getUTCDate();
  return {
    clave: `${anio}-b${n + 1}`,
    desde: `${anio}-${dos(mesInicio)}-01`,
    hasta: `${anio}-${dos(mesInicio + 1)}-${dos(ultimoDia)}`,
    nombre: `${MESES[mesInicio - 1]}–${MESES[mesInicio]} ${anio}`,
  };
}

function siguiente({ anio, n }, paso) {
  let total = anio * 6 + n + paso;
  return { anio: Math.floor(total / 6), n: ((total % 6) + 6) % 6 };
}

// hoyISO = 'AAAA-MM-DD' (hora de Colombia)
export function bimestreActual(hoyISO) {
  const [a, m] = String(hoyISO).split('-').map(Number);
  return { anio: a, n: Math.floor((m - 1) / 2) };
}

// Opciones para el selector: anterior, actual y los de este año y el
// anterior (del más reciente al más viejo).
export function opcionesBimestres(hoyISO) {
  const actual = bimestreActual(hoyISO);
  const anterior = siguiente(actual, -1);
  const lista = [];
  for (let i = 0; i < 12; i++) {
    const b = siguiente(actual, -i);
    const info = bimestre(b.anio, b.n);
    let etiqueta = info.nombre;
    if (i === 0) etiqueta = `Bimestre actual (${info.nombre})`;
    if (i === 1) etiqueta = `Bimestre anterior (${info.nombre})`;
    lista.push({ ...info, etiqueta });
  }
  return { actual: bimestre(actual.anio, actual.n), anterior: bimestre(anterior.anio, anterior.n), lista };
}

// Si el período es exactamente un bimestre, su nombre ("julio–agosto
// 2026"); si no, null.
export function nombreBimestre(desde, hasta) {
  const [a, m, d] = String(desde || '').split('-').map(Number);
  if (!a || d !== 1 || m % 2 !== 1) return null;
  const b = bimestre(a, (m - 1) / 2);
  return b.hasta === String(hasta) ? b.nombre : null;
}
