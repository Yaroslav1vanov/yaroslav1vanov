'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import CRMApp from '@/components/CRMApp';

export default function DashboardPage() {
  const [appData, setAppData] = useState(null);

  useEffect(() => {
    const sb = createClient();
    
    // Listen for auth state
    const { data: { subscription } } = sb.auth.onAuthStateChange(async (event, session) => {
      if (!session) {
        window.location.href = '/login';
        return;
      }
      
      const userId = session.user.id;
      
      const [profileRes, clientsRes, staffRes] = await Promise.all([
        sb.from('profiles').select('*').eq('id', userId).single(),
        sb.from('clients').select('id, data, updated_at').order('id'),
        sb.from('staff').select('*').order('id'),
      ]);

      const clients = (clientsRes.data || []).map(r => ({ ...r.data, id: r.id }));
      const staff = {
        editors: (staffRes.data || []).filter(s => s.type === 'editor').map(s => s.name),
        teamleads: (staffRes.data || []).filter(s => s.type === 'teamlead').map(s => s.name),
      };

      setAppData({
        clients,
        staff,
        profile: { ...(profileRes.data || {}), email: session.user.email },
      });
    });

    // Also check immediately
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session) window.location.href = '/login';
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!appData) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#04080F', flexDirection:'column', gap:'16px' }}>
      <div style={{ fontFamily:"'Exo 2',sans-serif", fontSize:'22px', fontWeight:900, color:'#D6E8F5' }}>
        Easy<span style={{ background:'linear-gradient(90deg,#00E5FF,#A855F7)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Life AI</span>
      </div>
      <div style={{ display:'flex', gap:'8px' }}>
        {[0,1,2].map(i => <div key={i} style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#00E5FF', animation:`pulse 1.2s ${i*0.2}s infinite ease-in-out` }} />)}
      </div>
      <style>{`@keyframes pulse{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );

  return <CRMApp initialClients={appData.clients} initialStaff={appData.staff} profile={appData.profile} />;
}
