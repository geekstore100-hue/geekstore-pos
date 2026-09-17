import Sidebar from './Sidebar';

export default function Shell({ title, children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header style={styles.topbar}>
          <span style={styles.title}>{title}</span>
          <span style={styles.badge}>Geek Store</span>
        </header>
        <main style={styles.main}>{children}</main>
      </div>
    </div>
  );
}

const styles = {
  topbar: {
    height: '56px',
    background: '#fff',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    flexShrink: 0,
  },
  title: { fontWeight: 600, fontSize: '16px' },
  badge: {
    background: '#111827',
    color: '#fff',
    fontSize: '12px',
    padding: '6px 12px',
    borderRadius: '999px',
  },
  main: { flex: 1, padding: '24px', minWidth: 0 },
};
