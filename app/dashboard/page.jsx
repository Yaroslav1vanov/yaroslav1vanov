'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import CRMApp from '@/components/CRMApp';

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { window.location.href = '/login'; return; }

      const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();
      if (!profile) { window.location.href = '/login'; return; }

      const { data: clientRows } = await sb.from('clients').select('id, data, updated_at').order('id');
      const clients = (clientRows || []).map(r => ({ ...r.data, id: r.id }));

      const { data: staffRows } = await sb.from('staff').select('*').order('id');
      const staff = {
        editors: (staffRows || []).filter(s => s.type === 'editor').map(s => s.name),
        teamleads: (staffRows || []).filter(s => s.type === 'teamlead').map(s => s.name),
      };

      setData({ clients, staff, profile: { ...profile, email: user.email } });
      setLoading(false);
    }
    init();
  }, []);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg, #04080F)', flexDirection: 'column', gap: '16px' }}>
      <div style={{ fontFamily: "'Exo 2', sans-serif", fontSize: '22px', fontWeight: 900, color: '#D6E8F5' }}>
        Easy<span style={{ background: 'linear-gradient(90deg,#00E5FF,#A855F7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Life AI</span>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00E5FF', animation: `pulse 1.2s ${i*0.2}s infinite ease-in-out` }} />)}
      </div>
      <style>{`@keyframes pulse{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );

  return <CRMApp initialClients={data.clients} initialStaff={data.staff} profile={data.profile} />;
}
