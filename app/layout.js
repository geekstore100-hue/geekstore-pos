import './globals.css';

export const metadata = {
  title: 'POS Geek Store',
  description: 'Sistema interno de inventario y ventas — Geek Store',
};

// Sin esto, los celulares renderizan la página como si fuera de escritorio
// (asumen ~980px de ancho) y la muestran alejada/chiquita — ningún ajuste de
// CSS responsive sirve de nada sin esta línea.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        {/* Botón de pánico (ver components/PanicoBoton.js): si la pantalla
            quedó "oculta" de una sesión anterior (recargaste el celular, se
            cerró y volvió a abrir la pestaña, etc.), esto tapa la pantalla
            ANTES de que se alcance a ver ni un parpadeo del contenido real
            — se ejecuta apenas el navegador llega a este punto del HTML,
            antes de que se pinte el resto de la página. El componente de
            React (dentro de Shell) toma el control apenas arranca y quita
            esta tapa provisional. Va como <script> plano, igual que el
            registro del service worker de abajo, para no tener que
            convertir este layout en "use client". No tapa /login: ahí no
            hay nada que ocultar y ese componente de React no vive ahí.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  if (
                    location.pathname !== '/login' &&
                    localStorage.getItem('geekstore_panico_activo') === '1'
                  ) {
                    var d = document.createElement('div');
                    d.id = 'pos-panic-cover-inicial';
                    d.setAttribute(
                      'style',
                      'position:fixed;inset:0;z-index:999999;background:#f3f4f6;' +
                      'display:flex;align-items:center;justify-content:center;' +
                      'font-family:Arial,sans-serif;color:#9ca3af;font-size:14px;'
                    );
                    d.textContent = 'Cargando...';
                    document.body.appendChild(d);
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
        {children}
        {/* Registra el service worker (public/sw.js) que permite que el
            sistema siga cargando sin internet — ver ese archivo para el
            detalle. Va como <script> plano (no un componente de React) para
            no tener que convertir este layout en "use client". */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js').catch(function () {
                    // Si falla el registro (navegador viejo, etc.) el sistema
                    // sigue funcionando normal, solo sin el respaldo offline.
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
