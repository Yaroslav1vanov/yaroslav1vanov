// All available permissions
export const ALL_PERMS = {
  create_client:    'Создавать клиентов',
  edit_client:      'Редактировать карточки',
  delete_client:    'Удалять клиентов',
  update_videos:    'Обновлять статус роликов',
  update_scripts:   'Обновлять статус сценариев',
  update_checklist: 'Отмечать задачи в чеклисте',
  add_notes:        'Добавлять заметки',
  manage_staff:     'Управлять командой',
  manage_users:     'Управлять пользователями CRM',
};

// Role presets
export const ROLE_PRESETS = {
  admin: {
    name: 'Администратор',
    perms: Object.keys(ALL_PERMS),
  },
  teamlead: {
    name: 'Team Lead',
    perms: ['create_client','edit_client','update_videos','update_scripts','update_checklist','add_notes','manage_staff'],
  },
  editor: {
    name: 'Монтажёр',
    perms: ['update_videos','update_checklist','add_notes'],
  },
  scriptwriter: {
    name: 'Сценарист',
    perms: ['update_scripts','update_checklist','add_notes'],
  },
  viewer: {
    name: 'Просмотр',
    perms: [],
  },
};

// Check if user profile has a permission
export function can(profile, perm) {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  const perms = Array.isArray(profile.perms) ? profile.perms : [];
  return perms.includes(perm);
}

// Which clients can this user see?
// admin/teamlead = all, editor/scriptwriter = only assigned clients
export function filterClientsByRole(clients, profile) {
  if (!profile) return [];
  if (['admin', 'teamlead'].includes(profile.role)) return clients;
  // Editors and scriptwriters see only clients assigned to their staff_name
  return clients.filter(c => c.editor === profile.staff_name || c.teamLead === profile.staff_name);
}
