import { redirect } from 'next/navigation';

// /cuentas ahora sirve la versión completa (paridad con producción).
// La página legacy quedó reemplazada por /cuentas-v2.
export default function CuentasPage() {
  redirect('/cuentas-v2');
}
