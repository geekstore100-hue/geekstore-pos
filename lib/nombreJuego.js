// lib/nombreJuego.js
// Formato del NOMBRE de los videojuegos en Geek Store (Nelson, nov 2026):
//   Juego <consola> <nombre del juego>        → "Juego Nintendo Switch Mario Party"
//   y si es usado, al final ". Usado"          → "Juego PS4 Battlefield 4. Usado"
//
// El borrador de la factura de compra ya trae los juegos con ese nombre, y
// "Analizar con IA" lo cambiaba. Ahora:
//   - Si el nombre que ya tiene el producto sigue este formato, la IA NO lo
//     cambia (se devuelve tal cual: ver app/api/productos/analizar-foto).
//   - Si la IA escribe el nombre de un juego desde cero, se le pide este
//     formato (REGLA_NOMBRE_JUEGO, va en las instrucciones de la IA).

// Consolas como las escribe Geek Store (y variantes comunes).
const CONSOLA =
  '(?:PS ?[1-5]|PlayStation ?[1-5]|PS Vita|PSP|Xbox Series [XS](?: ?\\| ?S| ?X)?|Xbox One|Xbox 360|Xbox|Nintendo Switch(?: 2| OLED)?|Switch(?: 2)?|Nintendo 3DS|3DS|Nintendo DS|Wii U|Wii|Nintendo 64|GameCube|PC)';

// "Juego <consola> <algo más>" (ej. "Juego PS4 Battlefield 4. Usado").
// "Juego de controles PS4" NO cuenta: después de "Juego" va la consola.
const FORMATO = new RegExp(`^Juego\\s+${CONSOLA}\\s+\\S`, 'i');

export function esNombreDeJuego(nombre) {
  return FORMATO.test(String(nombre || '').trim());
}

export const REGLA_NOMBRE_JUEGO = `NOMBRE DE LOS VIDEOJUEGOS (obligatorio): si el producto es un videojuego, el "nombre" va SIEMPRE con esta forma: "Juego <consola> <nombre del juego>", y si el juego es usado se le agrega al final ". Usado". Ejemplos: "Juego PS4 Battlefield 4. Usado", "Juego PS5 Madden 19. Usado", "Juego Nintendo Switch Mario Party". La consola se escribe corta: PS3, PS4, PS5, Xbox One, Xbox Series X, Nintendo Switch, Nintendo Switch 2. Pon ". Usado" SOLO si el nombre que ya tiene el producto o la información dicen que es usado. Si el nombre que ya tiene el producto ya está en esta forma, devuélvelo EXACTAMENTE igual, letra por letra.`;
