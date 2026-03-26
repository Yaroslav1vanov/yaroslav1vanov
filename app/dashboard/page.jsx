import { createClient } from '@/lib/supabase/server';
import { filterClientsByRole } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import CRMApp from '@/components/CRMApp';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const { data: clientRows } = await supabase.from('clients').select('id, data, updated_at').order('id');
  const allClients = (clientRows || []).map(r => ({ ...r.data, id: r.id }));
  const clients = filterClientsByRole(allClients, profile);

  const { data: staffRows } = await supabase.from('staff').select('*').order('id');
  const staff = {
    editors: (staffRows || []).filter(s => s.type === 'editor').map(s => s.name),
    teamleads: (staffRows || []).filter(s => s.type === 'teamlead').map(s => s.name),
  };

  return <CRMApp initialClients={clients} initialStaff={staff} profile={{ ...profile, email: user.email }} />;
}
