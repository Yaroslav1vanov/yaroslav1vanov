import { createClient } from '@/lib/supabase/server';
import { can } from '@/lib/permissions';
import { NextResponse } from 'next/server';

// PATCH /api/clients/:id — update client data
export async function PATCH(request, { params }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

  // Check at least one edit permission
  const canEdit = can(profile, 'edit_client') || can(profile, 'update_videos') ||
    can(profile, 'update_scripts') || can(profile, 'update_checklist') || can(profile, 'add_notes');
  if (!canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { id, _updatedAt, ...clientData } = body;
  const clientId = parseInt(params.id);

  const { error } = await supabase
    .from('clients')
    .update({ data: clientData, updated_at: new Date().toISOString() })
    .eq('id', clientId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/clients/:id — delete client
export async function DELETE(request, { params }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!can(profile, 'delete_client')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await supabase.from('clients').delete().eq('id', parseInt(params.id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
