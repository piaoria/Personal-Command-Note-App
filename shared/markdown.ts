import { parse, stringify } from 'yaml';
import { blankNote, LibraryError, migrateNote, noteSchema, type Note } from './library';

export function encodeNote(note: Note): string {
  const { description, ...metadata } = noteSchema.parse(note);
  return `---\n${stringify(metadata)}---\n${description}`;
}

export function decodeNote(raw: string): Note {
  const match = raw.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new LibraryError('VALIDATION_ERROR', 'Markdown 메타데이터를 읽을 수 없습니다.');
  const metadata: unknown = parse(match[1], { maxAliasCount: 10 });
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new LibraryError('VALIDATION_ERROR', '문서 메타데이터 형식이 올바르지 않습니다.');
  return migrateNote({ ...metadata, description: match[2] });
}

export function importMarkdown(name: string, raw: string): Note {
  if (raw.length > 1_000_000) throw new LibraryError('VALIDATION_ERROR', 'Markdown 파일은 1MB 이하여야 합니다.');
  const text = raw.replace(/^\uFEFF/, '');
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (frontmatter) {
    const metadata = parse(frontmatter[1], { maxAliasCount: 10 });
    if (metadata && Object.prototype.hasOwnProperty.call(metadata, 'schemaVersion')) return decodeNote(text);
  }
  const code = text.match(/```([^\r\n]*)\r?\n([\s\S]*?)```/);
  const shell = code && /powershell|pwsh|ps1/i.test(code[1]) ? 'powershell' : code && /bash|^sh$/i.test(code[1]) ? 'bash' : 'unknown';
  return noteSchema.parse({ ...blankNote('프로젝트·기타'), title: text.match(/^#\s+(.+)$/m)?.[1]?.trim().slice(0, 300) || name.replace(/\.md$/i, '').slice(0, 300), type: code?.[2]?.trim() ? 'command' : 'troubleshooting', tag: '가져옴', command: code?.[2]?.trim() ?? '', description: text, shell, environment: shell === 'unknown' ? '미확인' : shell, location: '미확인', risk: '미확인' });
}

export function prepareImports(files: { name: string; content: string }[], existingIds: Set<string>): Note[] {
  if (!files.length || files.length > 200) throw new LibraryError('VALIDATION_ERROR', '한 번에 Markdown 파일 1~200개를 가져올 수 있습니다.');
  const notes = files.map(file => importMarkdown(file.name, file.content));
  const seen = new Set<string>();
  const replacements = new Map<string, string>();
  for (const note of notes) {
    if (seen.has(note.id)) throw new LibraryError('VALIDATION_ERROR', '선택한 파일에 같은 문서 ID가 중복됩니다.');
    seen.add(note.id);
    if (existingIds.has(note.id)) replacements.set(note.id, crypto.randomUUID());
  }
  return notes.map(note => noteSchema.parse({ ...note, id: replacements.get(note.id) ?? note.id, lifecycle: 'active', lifecycleAt: undefined, steps: note.steps.map(step => ({ ...step, noteId: step.noteId ? replacements.get(step.noteId) ?? step.noteId : undefined })), updatedAt: new Date().toISOString() }));
}
