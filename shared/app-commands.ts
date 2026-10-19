const commands = [
  { id: 'simple', command: '/simple', label: '심플 모드로 전환', description: '검색창만 작게 표시합니다.', aliases: ['/심플'] },
  { id: 'expanded', command: '/expanded', label: '확장 모드로 전환', description: '전체 노트와 편집·설정을 표시합니다.', aliases: ['/확장'] },
  { id: 'toggle', command: '/toggle', label: '화면 모드 전환', description: '심플 모드와 확장 모드를 전환합니다.', aliases: ['/전환'] },
  { id: 'hide', command: '/hide', label: '트레이로 숨기기', description: '앱을 실행한 채 창을 숨깁니다.', aliases: ['/숨기기'] },
] as const;

export type AppCommand = (typeof commands)[number];
export type AppCommandId = AppCommand['id'];

type ShortcutEvent = {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

export function findAppShortcut(event: ShortcutEvent): 'search' | 'toggle-mode' | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  // Physical keys stay the same when the Windows input language changes.
  const code = event.code || `Key${event.key.toUpperCase()}`;
  if (code === 'KeyK') return 'search';
  if (code === 'KeyM' && event.shiftKey) return 'toggle-mode';
  return null;
}

// Only offer known app actions. A path or shell command is never evaluated.
export function findAppCommands(query: string): AppCommand[] {
  const value = query.trim().toLocaleLowerCase();
  if (!value.startsWith('/')) return [];
  return commands.filter(command => [command.command, ...command.aliases].some(alias => alias.startsWith(value)));
}
