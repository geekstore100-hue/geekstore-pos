import sql from './db';

// Datos legales de Geek Store (razón social, NIT, dirección, ciudad,
// teléfono) que van en el encabezado de documentos formales — por ahora
// solo el certificado de retención de ReteICA (Configuraciones >
// Certificados ReteICA / módulo de ReteICA). Se guardan en la tabla
// genérica "configuracion" (mismo patrón que ia_articulo y hora_arqueo):
//   clave = 'datos_empresa'
//   valor = {"razonSocial": "...", "nit": "...", "direccion": "...", "ciudad": "...", "telefono": "..."}
// Si nunca se ha configurado, todo llega vacío y el certificado avisa que
// falta completar estos datos antes de generarlo.

export const DATOS_EMPRESA_VACIOS = { razonSocial: '', nit: '', direccion: '', ciudad: 'Bogotá D.C.', telefono: '' };

export async function leerDatosEmpresa() {
  try {
    const [fila] = await sql`SELECT valor FROM configuracion WHERE clave = 'datos_empresa'`;
    if (!fila?.valor) return { ...DATOS_EMPRESA_VACIOS };
    const v = JSON.parse(fila.valor);
    return {
      razonSocial: v.razonSocial || '',
      nit: v.nit || '',
      direccion: v.direccion || '',
      ciudad: v.ciudad || 'Bogotá D.C.',
      telefono: v.telefono || '',
    };
  } catch {
    return { ...DATOS_EMPRESA_VACIOS };
  }
}

export async function guardarDatosEmpresa({ razonSocial, nit, direccion, ciudad, telefono }) {
  const datos = {
    razonSocial: String(razonSocial || '').trim(),
    nit: String(nit || '').trim(),
    direccion: String(direccion || '').trim(),
    ciudad: String(ciudad || '').trim() || 'Bogotá D.C.',
    telefono: String(telefono || '').trim(),
  };
  const valor = JSON.stringify(datos);
  await sql`
    INSERT INTO configuracion (clave, valor, actualizado_en)
    VALUES ('datos_empresa', ${valor}, NOW())
    ON CONFLICT (clave) DO UPDATE SET valor = ${valor}, actualizado_en = NOW()
  `;
  return datos;
}
