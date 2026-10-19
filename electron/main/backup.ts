import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { libraryStateSchema, LibraryError, type LibraryState, type Note } from '../../shared/library';
import { decodeNote, encodeNote } from '../../shared/markdown';

const MAX_TOTAL = 50_000_000;
function validateReferences(notes: Note[], state: LibraryState) {
  const byId = new Map(notes.map(note => [note.id, note]));
  if (byId.size !== notes.length || [...state.favorites, ...state.recent].some(id => !byId.has(id))) throw new LibraryError('VALIDATION_ERROR', '백업에 중복 또는 누락된 문서 ID가 있습니다.');
  for (const note of notes) for (const step of note.steps) {
    if (!step.noteId) continue;
    const linked = byId.get(step.noteId);
    if (!linked || linked.type === 'workflow') throw new LibraryError('VALIDATION_ERROR', '백업의 작업 단계에 유효한 명령어 카드가 없습니다.');
  }
}
export function makeBackup(notes: Note[], state: LibraryState): Uint8Array {
  validateReferences(notes, state);
  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify({ schemaVersion: 1 })),
    'library-state.json': strToU8(JSON.stringify(libraryStateSchema.parse(state))),
  };
  for (const note of notes) files[`notes/${note.id}.md`] = strToU8(encodeNote(note));
  const total = Object.values(files).reduce((sum, value) => sum + value.length, 0);
  if (total > MAX_TOTAL || notes.length > 2000) throw new LibraryError('VALIDATION_ERROR', '백업은 문서 2000개, 전체 50MB까지 지원합니다.');
  return zipSync(files, { level: 6 });
}

export function parseBackup(bytes: Uint8Array): { notes: Note[]; state: LibraryState } {
  if (bytes.length > MAX_TOTAL) throw new LibraryError('VALIDATION_ERROR', '백업 파일이 50MB를 넘습니다.');
  let total = 0;
  const names = new Set<string>();
  const files = unzipSync(bytes, { filter(entry) {
    const valid = entry.name === 'manifest.json' || entry.name === 'library-state.json' || /^notes\/[0-9a-f-]{36}\.md$/i.test(entry.name);
    total += entry.originalSize;
    if (!valid || names.has(entry.name) || entry.originalSize > 1_000_000 || total > MAX_TOTAL || names.size >= 2002) throw new LibraryError('VALIDATION_ERROR', '백업의 경로·크기·중복 항목을 확인해 주세요.');
    names.add(entry.name);
    return true;
  } });
  const manifest = JSON.parse(strFromU8(files['manifest.json'] ?? new Uint8Array()));
  if (manifest.schemaVersion !== 1) throw new LibraryError('UNSUPPORTED_SCHEMA', '지원하지 않는 백업 버전입니다.');
  const state = libraryStateSchema.parse(JSON.parse(strFromU8(files['library-state.json'] ?? new Uint8Array())));
  const notes = Object.entries(files).filter(([name]) => name.startsWith('notes/')).map(([name, data]) => {
    const note = decodeNote(strFromU8(data));
    if (`notes/${note.id}.md` !== name) throw new LibraryError('VALIDATION_ERROR', '백업의 파일 이름과 문서 ID가 다릅니다.');
    return note;
  });
  validateReferences(notes, state);
  return { notes, state };
}
