import CRMApp from '@/components/CRMApp';

export default function DashboardPage() {
  return (
    <CRMApp
      initialClients={[]}
      initialStaff={{ editors: ['Аня','Алиса','Катя'], teamleads: ['Лена','Кристина'] }}
      profile={{ id: '1', name: 'Ярослав', role: 'admin', email: '', perms: ['create_client','edit_client','delete_client','update_videos','update_scripts','update_checklist','add_notes','manage_staff','manage_users'] }}
    />
  );
}
