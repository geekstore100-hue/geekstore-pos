import { redirect } from 'next/navigation';

// Ya no existe un panel de "Inicio" aparte: la pantalla de Vender es ahora
// la página principal. Este archivo se deja solo por si algo o alguien
// todavía visita /inicio (por ejemplo un enlace guardado).
export default function InicioPage() {
  redirect('/ventas');
}
