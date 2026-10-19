import { z } from 'zod';
export const windowModeSchema = z.enum(['simple', 'expanded']);
export const appearanceSchema = z.object({ dark: z.boolean(), opacity: z.number().int().min(40).max(100), mode: windowModeSchema.default('expanded') });
export const windowLayoutSchema = z.object({ mode: windowModeSchema, resultCount: z.number().int().min(0).max(100_000), hasQuery: z.boolean(), contentHeight: z.number().int().min(96).max(640).optional() });
export const variableSchema = z.object({ name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).max(60), label: z.string().max(100), required: z.boolean().default(true) });
export const stepSchema = z.object({ id: z.string().uuid(), title: z.string().min(1).max(200), noteId: z.string().uuid().optional(), instruction: z.string().max(20_000).default(''), expectedResult: z.string().max(10_000).default(''), nextAction: z.string().max(10_000).default('') });
export const noteSchema = z.object({
  schemaVersion: z.literal(2), id: z.string().uuid(), title: z.string().trim().min(1).max(300), type: z.enum(['command', 'gui', 'workflow', 'troubleshooting']).default('command'),
  category: z.string().min(1).max(100), tag: z.string().max(100), command: z.string().max(100_000), description: z.string().max(200_000),
  environment: z.string().max(200), shell: z.enum(['powershell', 'bash', 'gui', 'unknown']).default('unknown'), risk: z.string().max(100), location: z.string().max(200),
  expectedResult: z.string().max(30_000).default(''), optionsText: z.string().max(30_000).default(''), caution: z.string().max(20_000).default(''),
  variables: z.array(variableSchema).max(30).default([]), steps: z.array(stepSchema).max(100).default([]), lifecycle: z.enum(['active', 'archived', 'deleted']).default('active'), lifecycleAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).passthrough().superRefine((note, context) => {
  if (note.type === 'command' && !note.command.trim()) context.addIssue({ code: 'custom', path: ['command'], message: '명령을 입력해 주세요.' });
  if (note.type === 'workflow' && !note.steps.length) context.addIssue({ code: 'custom', path: ['steps'], message: '작업 단계를 한 개 이상 추가해 주세요.' });
  if (new Set(note.variables.map(item => item.name)).size !== note.variables.length) context.addIssue({ code: 'custom', path: ['variables'], message: '변수 이름이 중복됩니다.' });
  if (note.steps.some(step => step.noteId === note.id)) context.addIssue({ code: 'custom', path: ['steps'], message: '자기 자신을 단계에 연결할 수 없습니다.' });
});
export type Note = z.infer<typeof noteSchema>;
export function migrateNote(value: unknown): Note {
  if (!value || typeof value !== 'object') throw new LibraryError('VALIDATION_ERROR', '문서 형식이 올바르지 않습니다.');
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 1 && input.schemaVersion !== 2) throw new LibraryError('UNSUPPORTED_SCHEMA', '지원하지 않는 문서 버전입니다. 원본을 보존합니다.');
  if (input.schemaVersion === 2) return noteSchema.parse(input);
  const environment = String(input.environment ?? '');
  const shell = environment.includes('GUI') ? 'gui' : /PowerShell/i.test(environment) && !/Bash/i.test(environment) ? 'powershell' : /^Bash$/i.test(environment) ? 'bash' : 'unknown';
  return noteSchema.parse({ ...input, schemaVersion: 2, type: shell === 'gui' ? 'gui' : 'command', shell });
}
export const libraryStateSchema = z.object({ schemaVersion: z.literal(1), favorites: z.array(z.string().uuid()).max(10_000), recent: z.array(z.string().uuid()).max(5) });
export type Appearance = z.infer<typeof appearanceSchema>;
export type WindowLayoutInput = z.infer<typeof windowLayoutSchema>;
export type LibraryState = z.infer<typeof libraryStateSchema>;
export type NoteRecord = { note: Note; revision: string };
export type LibrarySnapshot = { records: NoteRecord[]; state: LibraryState; appearance: Appearance; issues: string[]; dataPath: string };
export type ErrorCode = 'VALIDATION_ERROR' | 'CONFLICT' | 'IO_ERROR' | 'UNSUPPORTED_SCHEMA';
export type Result<T> = { ok: true; value: T } | { ok: false; code: ErrorCode; message: string };
export type SaveNoteInput = { note: Note; expectedRevision: string | null };
export type LifecycleInput = { id: string; expectedRevision: string; lifecycle: Note['lifecycle'] };
export type BackupPreview = { token: string; notes: number; archived: number; deleted: number };
export type TransferResult = { count: number; canceled?: boolean };
export type ShortcutState = { accelerator: string; registered: boolean; toggleAccelerator: string; toggleRegistered: boolean; trayAvailable?: boolean };
export interface LibraryRepository {
  load(): Promise<LibrarySnapshot>;
  saveNote(input: SaveNoteInput): Promise<NoteRecord>;
  setLifecycle(input: LifecycleInput): Promise<NoteRecord>;
  setFavorite(id: string, favorite: boolean): Promise<LibraryState>;
  touchRecent(id: string): Promise<LibraryState>;
  saveAppearance(appearance: Appearance): Promise<Appearance>;
}
export interface DesktopApi {
  load(): Promise<Result<LibrarySnapshot>>;
  saveNote(input: SaveNoteInput): Promise<Result<NoteRecord>>;
  setLifecycle(input: LifecycleInput): Promise<Result<NoteRecord>>;
  setFavorite(id: string, favorite: boolean): Promise<Result<LibraryState>>;
  touchRecent(id: string): Promise<Result<LibraryState>>;
  saveAppearance(appearance: Appearance): Promise<Result<Appearance>>;
  importMarkdown(): Promise<Result<TransferResult>>;
  exportMarkdown(ids: string[]): Promise<Result<TransferResult>>;
  exportBackup(): Promise<Result<boolean>>;
  inspectBackup(): Promise<Result<BackupPreview | null>>;
  restoreBackup(token: string): Promise<Result<void>>;
  getShortcut(): Promise<Result<ShortcutState>>;
  setShortcut(accelerator: string): Promise<Result<ShortcutState>>;
  setModeShortcut(accelerator: string): Promise<Result<ShortcutState>>;
  onFocusSearch(callback: () => void): () => void;
  onToggleMode(callback: () => void): () => void;
  openExternal(url: string): Promise<Result<void>>;
  openDataFolder(): Promise<Result<void>>;
  setAlwaysOnTop(value: boolean): Promise<Result<boolean>>;
  setWindowLayout(input: WindowLayoutInput): Promise<Result<void>>;
  minimize(): Promise<Result<void>>;
  hide(): Promise<Result<void>>;
  quit(): Promise<Result<void>>;
  copyText(text: string): Promise<Result<void>>;
}
export class LibraryError extends Error { constructor(public code: ErrorCode, message: string) { super(message); } }
export function unwrap<T>(result: Result<T>): T { if (!result.ok) throw new LibraryError(result.code, result.message); return result.value; }
export const defaultAppearance: Appearance = { dark: false, opacity: 100, mode: 'expanded' };
export function blankNote(category = 'Docker'): Note {
  const now = new Date().toISOString();
  return { schemaVersion: 2, id: crypto.randomUUID(), title: '', type: 'command', category, tag: '', command: '', description: '', environment: 'PowerShell', shell: 'powershell', risk: '미확인', location: '내 PC · 개발', expectedResult: '', optionsText: '', caution: '', variables: [], steps: [], lifecycle: 'active', createdAt: now, updatedAt: now };
}
