import { redirect } from 'next/navigation';
import { OpsDashboard } from '@/components/ops-dashboard';
import { getCurrentSessionUser } from '@/server/auth-session';

export default async function Home() {
  const sessionUser = await getCurrentSessionUser();

  if (!sessionUser) {
    redirect('/login');
  }

  return <OpsDashboard />;
}
