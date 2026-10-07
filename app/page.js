'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Página de entrada (también a donde lleva el login):
//   - en el celular → panel de botones grandes (/inicio);
//   - en el computador → Vender, como siempre.
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const esCelular = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
    router.replace(esCelular ? '/inicio' : '/ventas');
  }, [router]);
  return null;
}
