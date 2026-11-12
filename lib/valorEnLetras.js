// lib/valorEnLetras.js — nov 2026. El valor en letras para el comprobante de
// egreso (lib/gastos.js). Sin dependencias: se usa también en el navegador.

const UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function hasta999(n) {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100);
  const r = n % 100;
  let t = CENTENAS[c];
  if (r) {
    const dos = r < 30 ? UNIDADES[r] : `${DECENAS[Math.floor(r / 10)]}${r % 10 ? ` y ${UNIDADES[r % 10]}` : ''}`;
    t = t ? `${t} ${dos}` : dos;
  }
  return t;
}

// 1.250.000 → "un millón doscientos cincuenta mil pesos m/cte"
export function valorEnLetras(valor) {
  let n = Math.round(Math.abs(Number(valor) || 0));
  if (n === 0) return 'cero pesos m/cte';
  if (n === 1) return 'un peso m/cte';
  const millones = Math.floor(n / 1e6);
  const miles = Math.floor((n % 1e6) / 1000);
  const resto = n % 1000;
  const partes = [];
  if (millones) {
    if (millones === 1) partes.push('un millón');
    else partes.push(`${apocopar(enLetrasMenorAMillon(millones))} millones`);
  }
  if (miles) partes.push(miles === 1 ? 'mil' : `${apocopar(hasta999(miles))} mil`);
  if (resto) partes.push(hasta999(resto));
  // "un millón de pesos" (redondo) / "un millón cien mil pesos"
  const de = millones && !miles && !resto ? ' de' : '';
  return `${apocopar(partes.join(' '))}${de} pesos m/cte`;
}
function enLetrasMenorAMillon(n) {
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  return [miles ? (miles === 1 ? 'mil' : `${apocopar(hasta999(miles))} mil`) : '', hasta999(resto)].filter(Boolean).join(' ');
}
// "veintiuno mil" → "veintiún mil", "uno" al final → "un" (antes de "mil", "millones" o "pesos")
function apocopar(t) {
  return t.replace(/veintiuno$/, 'veintiún').replace(/(^|\s)uno$/, '$1un');
}
