// Checklist sections with deadlines
export const OB = [
  { s: 'ONBOARDING / СТАРТ', dO: 1, c: '#A78BFA', i: [
    { id: 1, t: 'Создать TG-канал проекта' },
    { id: 2, t: 'Отправить приветственное сообщение' },
    { id: 3, t: 'Назначить распаковку (дата в 24ч)' },
    { id: 4, t: 'Отправить ТЗ по записи AI-Аватара' },
    { id: 5, t: 'Запросить доступы к Instagram' },
    { id: 6, t: 'Зафиксировать дедлайны в TG-канале' },
  ]},
  { s: 'ПОДГОТОВКА ПРОИЗВОДСТВА', dO: 1, c: '#60A5FA', i: [
    { id: 7, t: 'ТЗ сценаристу — поиск 20 рефов в нише' },
    { id: 8, t: 'Создать карточку клиента в базе' },
    { id: 9, t: 'Составить вопросы для распаковки' },
  ]},
  { s: 'РАСПАКОВКА / МОДЕЛИРОВАНИЕ', dO: 3, c: '#34D399', i: [
    { id: 10, t: 'Провести распаковку клиента (1–1.5ч, запись!)' },
    { id: 11, t: 'Транскрибировать распаковку через GPTs' },
  ]},
  { s: 'СИСТЕМА / СТРАТЕГИЯ', dO: 4, c: '#F59E0B', i: [
    { id: 12, t: 'Сформировать полную карточку клиента' },
    { id: 13, t: 'Прописать структуру продающего аудио' },
    { id: 14, t: 'Скинуть текст аудио клиенту на утверждение' },
    { id: 15, t: 'Назначить дедлайн записи аудиодорожки' },
  ]},
  { s: 'ВОРОНКА', dO: 5, c: '#818CF8', i: [
    { id: 16, t: 'Спроектировать путь клиента в Miro' },
    { id: 17, t: 'Прописать структуру касаний' },
    { id: 18, t: 'Создать TG-бота под воронку' },
    { id: 19, t: 'Подготовить контент в TG-боте' },
  ]},
  { s: 'КОНТЕНТ + AI-АВАТАР', dO: 6, c: '#F472B6', i: [
    { id: 20, t: 'Получить продающее аудио от клиента' },
    { id: 21, t: 'Интегрировать аудио в воронку' },
    { id: 22, t: 'Контроль записи AI-Аватара' },
    { id: 23, t: 'Получить AI-Аватар и загрузить в HeyGen' },
  ]},
  { s: 'СЦЕНАРИИ', dO: 'pub-10', c: '#2DD4BF', i: [
    { id: 24, t: 'Написать сценарии по референсам' },
    { id: 25, t: 'Согласовать сценарии с клиентом' },
  ]},
  { s: 'МОНТАЖ', dO: 'pub-3', c: '#FB923C', i: [
    { id: 26, t: 'Передать сценарии монтажёру' },
    { id: 27, t: 'Получить первые ролики из монтажа' },
    { id: 28, t: 'Согласовать ролики с клиентом' },
  ]},
  { s: 'ПУБЛИКАЦИИ', dO: 'pub', c: '#00E5FF', i: [
    { id: 29, t: 'Согласовать план публикаций' },
    { id: 30, t: 'Первая публикация — запуск системы! 🚀' },
  ]},
];

export const AIDS = OB.flatMap(s => s.i.map(x => x.id));
export const SCRIPT_BEFORE = 10;
export const VIDEO_BEFORE = 3;
export const WARN_DAYS = 2;

// Create empty client object
export function makeClient(id, overrides = {}) {
  const vt = overrides.vt || 30;
  return {
    id,
    name: '',
    niche: '',
    role: '',
    phone: '',
    ig: '',
    tiktok: '',
    youtube: '',
    editor: '',
    teamLead: '',
    pkg: '',
    vt,
    stage: 'Онбординг',
    priority: 'mid',
    pubDate: '',
    start: new Date().toISOString().split('T')[0],
    done: [],
    notes: '',
    videos: Array.from({ length: vt }, (_, i) => ({
      id: i + 1, title: `Ролик #${i + 1}`, date: '', status: 'idle', pubUrl: '',
    })),
    scripts: Array.from({ length: vt }, (_, i) => ({
      id: i + 1, title: `Сценарий #${i + 1}`, date: '', status: 'idle',
      ref: '', transcript: '', hook: '', body: '', cta: '', descText: '',
    })),
    ...overrides,
  };
}

// Deadline calculation
export function sectionDeadline(sec, startStr, pubDateStr) {
  if (!startStr) return null;
  const start = new Date(startStr);
  const off = sec.dO;
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  if (typeof off === 'number') return addDays(start, off);
  if (off === 'pub-10') return pubDateStr ? addDays(new Date(pubDateStr), -SCRIPT_BEFORE) : addDays(start, 10);
  if (off === 'pub-3')  return pubDateStr ? addDays(new Date(pubDateStr), -VIDEO_BEFORE)  : addDays(start, 14);
  if (off === 'pub')    return pubDateStr ? new Date(pubDateStr) : addDays(start, 18);
  return null;
}
