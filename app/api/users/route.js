import { createClient, createServiceClient } from '@/lib/supabase/server';
import { can } from '@/lib/permissions';
import { NextResponse } from 'next/server';

// GET /api/users — list all users with profiles
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!can(profile, 'manage_users')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Use service client to get auth users list (requires service role)
  const service = createServiceClient();
  const { data: authData } = await service.auth.admin.listUsers();
  const { data: profiles } = await supabase.from('profiles').select('*').order('created_at');

  const users = (profiles || []).map(p => {
    const authUser = authData?.users?.find(u => u.id === p.id);
    return { ...p, email: authUser?.email || '' };
  });

  return NextResponse.json({ users });
}

// POST /api/users — create new user
export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!can(profile, 'manage_users')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { name, email, password, role, perms, staffName } = await request.json();
  if (!email || !password || password.length < 6) {
    return NextResponse.json({ error: 'Email и пароль (мин. 6 символов) обязательны' }, { status: 400 });
  }

  // Create auth user via service role
  const service = createServiceClient();
  const { data: created, error: authError } = await service.auth.admin.createUser({
    email, password,
    user_metadata: { name },
    email_confirm: true, // skip email verification
  });
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 });

  // Update profile (trigger creates it with viewer role)
  await new Promise(r => setTimeout(r, 500));
  await service.from('profiles').update({
    name, role, perms, staff_name: staffName,
  }).eq('id', created.user.id);

  return NextResponse.json({ id: created.user.id });
}

// PATCH /api/users — update user profile
export async function PATCH(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!can(profile, 'manage_users')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { userId, name, role, perms, staffName, password } = await request.json();

  const service = createServiceClient();
  await service.from('profiles').update({
    name, role, perms, staff_name: staffName,
  }).eq('id', userId);

  if (password && password.length >= 6) {
    await service.auth.admin.updateUserById(userId, { password });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/users — delete user
export async function DELETE(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!can(profile, 'manage_users')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { userId } = await request.json();
  if (userId === user.id) return NextResponse.json({ error: 'Нельзя удалить себя' }, { status: 400 });

  const service = createServiceClient();
  await service.auth.admin.deleteUser(userId);
  return NextResponse.json({ ok: true });
}
