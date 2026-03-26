import { createClient } from '@/lib/supabase/server';
import { can } from '@/lib/permissions';
import { NextResponse } from 'next/server';

// GET /api/staff
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase.from('staff').select('*').order('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const editors   = (data || []).filter(s => s.type === 'editor').map(s => s.name);
  const teamleads = (data || []).filter(s => s.type === 'teamlead').map(s => s.name);
  return NextResponse.json({ editors, teamleads });
}

// POST /api/staff — add member
export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!can(profile, 'manage_staff')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { type, name } = await request.json();
  const { error } = await supabase.from('staff').insert({ type, name });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/staff — remove member
export async function DELETE(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!can(profile, 'manage_staff')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { type, name } = await request.json();
  const { error } = await supabase.from('staff').delete().eq('type', type).eq('name', name);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
