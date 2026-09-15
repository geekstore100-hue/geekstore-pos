export default function Home() {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: '40px' }}>
      <h1>POS Geek Store — Kennedy</h1>
      <p>Sesión iniciada correctamente.</p>
      <a href="/api/logout">Cerrar sesión</a>
    </main>
  );
}
