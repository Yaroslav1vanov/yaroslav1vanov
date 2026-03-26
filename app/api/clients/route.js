import { createClient } from '@/lib/supabase/server';
import { can, filterClientsByRole } from '@/lib/permissions';
import { NextResponse } from 'next/server';

// GET /api/clients — list all clients (filtered by role)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const { data: rows, error } = await supabase.from('clients').select('id, data, created_at, updated_at').order('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const clients = (rows || []).map(r => ({ ...r.data, id: r.id, _updatedAt: r.updated_at }));
  const filtered = filterClientsByRole(clients, profile);

  return NextResponse.json({ clients: filtered, profile });
}

// POST /api/clients — create new client
export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!can(profile, 'create_client')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { id, ...clientData } = body;

  // Get and increment next ID atomically
  const { data: nidRow } = await supabase.from('settings').select('value').eq('key', 'nid').single();
  const nextId = (nidRow?.value?.val || 1);
  await supabase.from('settings').upsert({ key: 'nid', value: { val: nextId + 1 } });

  const { error } = await supabase.from('clients').insert({
    id: nextId,
    data: clientData,
    created_by: user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: nextId });
}
