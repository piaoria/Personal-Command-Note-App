import { LibraryError, type ShortcutState } from '../../shared/library';

export type ShortcutPreferences = { accelerator: string; toggleAccelerator: string };
export type ShortcutAction = 'show' | 'toggle';
export type ShortcutBackend = { register(accelerator: string, callback: () => void): boolean; unregister(accelerator: string): void };

const defaults: ShortcutPreferences = { accelerator: 'Ctrl+Alt+K', toggleAccelerator: 'Ctrl+Alt+M' };
const modifierAliases: Record<string, string> = { ctrl: 'Ctrl', control: 'Ctrl', cmdorctrl: 'Ctrl', commandorcontrol: 'Ctrl', alt: 'Alt', option: 'Alt', shift: 'Shift', super: 'Super', meta: 'Super', win: 'Super', windows: 'Super' };
const modifierOrder = ['Ctrl', 'Alt', 'Shift', 'Super'];

export function normalizeShortcut(value: unknown): string {
  const invalid = () => new LibraryError('VALIDATION_ERROR', '예: Ctrl+Alt+K, Ctrl+Shift+Space. 비워 두면 해제됩니다.');
  if (typeof value !== 'string' || value.length > 100) throw invalid();
  if (!value.trim()) return '';
  const parts = value.split('+').map(part => part.trim());
  const key = parts.pop()!.toUpperCase();
  const modifiers = parts.map(part => { const alias = part.toLowerCase(); return Object.hasOwn(modifierAliases, alias) ? modifierAliases[alias] : undefined; });
  if (!modifiers.length || modifiers.some(modifier => !modifier) || new Set(modifiers).size !== modifiers.length || !modifiers.some(modifier => modifier !== 'Shift')) throw invalid();
  if (!/^(?:[A-Z0-9]|SPACE|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(key)) throw invalid();
  return [...modifierOrder.filter(modifier => modifiers.includes(modifier)), key === 'SPACE' ? 'Space' : key].join('+');
}

export function readShortcutPreferences(value: unknown): ShortcutPreferences {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const read = (key: keyof ShortcutPreferences) => {
    if (!(key in input)) return defaults[key];
    try { return normalizeShortcut(input[key]); }
    catch { return defaults[key]; }
  };
  const preferences = { accelerator: read('accelerator'), toggleAccelerator: read('toggleAccelerator') };
  // A legacy custom search binding wins over the newly introduced default.
  if (preferences.accelerator && preferences.accelerator === preferences.toggleAccelerator) preferences.toggleAccelerator = '';
  return preferences;
}

export default class ShortcutController {
  private preferences: ShortcutPreferences = { ...defaults };
  private registered = { show: false, toggle: false };
  private pending: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(private backend: ShortcutBackend, private persist: (preferences: ShortcutPreferences) => Promise<void>, private callbacks: Record<ShortcutAction, () => void>) {}

  initialize(value?: unknown): ShortcutState {
    this.preferences = readShortcutPreferences(value);
    this.registered.show = this.register(this.preferences.accelerator, 'show');
    this.registered.toggle = this.register(this.preferences.toggleAccelerator, 'toggle');
    return this.state();
  }

  state(): ShortcutState {
    return { ...this.preferences, registered: this.registered.show, toggleRegistered: this.registered.toggle };
  }

  set(action: ShortcutAction, input: unknown): Promise<ShortcutState> {
    const operation = this.pending.then(async () => {
      if (this.disposed) throw new LibraryError('IO_ERROR', '앱을 종료하는 중입니다.');
      const value = normalizeShortcut(input);
      const key = action === 'show' ? 'accelerator' : 'toggleAccelerator';
      const otherKey = action === 'show' ? 'toggleAccelerator' : 'accelerator';
      if (value && value === this.preferences[otherKey]) throw new LibraryError('CONFLICT', '앱 열기와 모드 전환에 서로 다른 단축키를 지정해 주세요. 기존 설정을 유지했습니다.');
      const previous = this.preferences[key];
      if (value === previous && (this.registered[action] || !value)) return this.state();
      if (value && !this.register(value, action)) throw new LibraryError('CONFLICT', '다른 프로그램에서 사용하는 단축키입니다. 기존 설정을 유지했습니다.');
      const next = { ...this.preferences, [key]: value };
      try { await this.persist(next); }
      catch (error) { if (value) this.backend.unregister(value); throw error; }
      if (previous && previous !== value && this.registered[action]) this.backend.unregister(previous);
      this.preferences = next;
      this.registered[action] = !!value;
      return this.state();
    });
    this.pending = operation.then(() => undefined, () => undefined);
    return operation;
  }

  settle(): Promise<void> { return this.pending; }

  dispose(): void {
    this.disposed = true;
    if (this.registered.show) this.backend.unregister(this.preferences.accelerator);
    if (this.registered.toggle) this.backend.unregister(this.preferences.toggleAccelerator);
    this.registered = { show: false, toggle: false };
  }

  private register(value: string, action: ShortcutAction): boolean {
    if (!value) return false;
    try { return this.backend.register(value, this.callbacks[action]); }
    catch { return false; }
  }
}
