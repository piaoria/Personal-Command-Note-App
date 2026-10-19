import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { zipSync, strToU8 } from 'fflate';
import { initialNotes } from '../shared/examples';
import { blankNote, migrateNote, noteSchema, type Note } from '../shared/library';
import { encodeNote, decodeNote, importMarkdown, prepareImports } from '../shared/markdown';
import { fillCommand } from '../shared/commands';
import { makeBackup, parseBackup } from '../electron/main/backup';
import { NoteStore } from '../electron/main/note-store';

async function fixture() {
  await fs.mkdir(path.resolve('.test-data'), { recursive: true });
  const directory = await fs.mkdtemp(path.resolve('.test-data/features-'));
  return { directory, store: new NoteStore(directory) };
}
const card = (): Note => ({ ...initialNotes[0], id: randomUUID(), shell: 'powershell', command: 'docker inspect {{container}}', variables: [{ name: 'container', label: '컨테이너명', required: true }], expectedResult: 'Mounts에서 Source와 Destination을 확인', risk: '조회' });
const workflow = (noteId: string): Note => ({ ...blankNote(), title: '양식 위치 확인', type: 'workflow', steps: [{ id: randomUUID(), title: '설정 확인', noteId, instruction: '대상을 확인한다', expectedResult: '마운트 정보를 읽는다', nextAction: '연결 방식에 따라 경로를 확인한다' }] });

test('legacy notes migrate in memory with identity and original command preserved', () => {
  const legacy = { id: initialNotes[0].id, schemaVersion: 1, title: '이전 기록', category: 'Docker', tag: '조회', command: 'docker ps', description: '기존 본문', environment: 'PowerShell / Bash', risk: '조회', location: '로컬', createdAt: initialNotes[0].createdAt, updatedAt: initialNotes[0].updatedAt };
  const migrated = decodeNote(`---\n${Object.entries(legacy).filter(([key]) => key !== 'description').map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n${legacy.description}`);
  assert.equal(migrated.schemaVersion, 2); assert.equal(migrated.id, legacy.id); assert.equal(migrated.command, legacy.command); assert.equal(migrated.shell, 'unknown');
  assert.equal(migrateNote(legacy).description, legacy.description);
});

test('PowerShell and Bash variable arguments quote spaces, apostrophes and expansions', () => {
  const note = card();
  assert.equal(fillCommand(note, { container: "my box'; $(evil)" }), "docker inspect 'my box''; $(evil)'");
  assert.equal(fillCommand({ ...note, shell: 'bash' }, { container: "my box'; $(evil)" }), `docker inspect 'my box'"'"'; $(evil)'`);
  assert.throws(() => fillCommand(note, {}));
  assert.throws(() => fillCommand(note, { container: 'line\nnext' }));
  assert.throws(() => fillCommand({ ...note, shell: 'unknown' }, { container: 'be' }));
});

test('variables embedded in quotes or tokens are rejected before copying', () => {
  const note = card();
  for (const command of ['echo "prefix {{container}} suffix"', "echo '{{container}}'", 'echo prefix{{container}}', 'echo {{container}}/path', 'echo {{unknown}}', 'echo {{bad-name}}']) {
    assert.throws(() => fillCommand({ ...note, command }, { container: '$(evil)' }), command);
  }
  assert.equal(fillCommand({ ...note, command: 'echo --name={{container}}', shell: 'bash' }, { container: 'my value' }), "echo --name='my value'");
});

test('Docker Go templates stay literal alongside application variables', () => {
  assert.equal(fillCommand(initialNotes[1], {}), initialNotes[1].command);
  const note = { ...card(), command: "docker inspect {{container}} --format '{{json .Mounts}}'" };
  assert.equal(fillCommand(note, { container: 'be' }), "docker inspect 'be' --format '{{json .Mounts}}'");
});

test('environment, variables, workflow links and result instructions persist on disk', async () => {
  const { directory, store } = await fixture();
  await store.load();
  const note = card(); const work = workflow(note.id);
  await store.saveNote({ note, expectedRevision: null });
  await store.saveNote({ note: work, expectedRevision: null });
  const loaded = await new NoteStore(directory).load();
  assert.deepEqual(loaded.records.find(record => record.note.id === work.id)?.note.steps, work.steps);
  assert.equal(loaded.records.find(record => record.note.id === note.id)?.note.expectedResult, note.expectedResult);
  const exported = await store.exportMarkdown([work.id]);
  assert.equal(exported.length, 2);
});

test('archive, delete and restore keep the same UUID and workflow reference', async () => {
  const { directory, store } = await fixture();
  const current = (await store.load()).records[0];
  const work = workflow(current.note.id);
  await store.saveNote({ note: work, expectedRevision: null });
  let changed = await store.setLifecycle({ id: current.note.id, expectedRevision: current.revision, lifecycle: 'archived' });
  changed = await store.setLifecycle({ id: changed.note.id, expectedRevision: changed.revision, lifecycle: 'deleted' });
  assert.equal((await new NoteStore(directory).load()).records.find(record => record.note.id === changed.note.id)?.note.lifecycle, 'deleted');
  changed = await store.setLifecycle({ id: changed.note.id, expectedRevision: changed.revision, lifecycle: 'active' });
  assert.equal(changed.note.id, current.note.id);
  assert.equal((await store.load()).records.find(record => record.note.id === work.id)?.note.steps[0].noteId, current.note.id);
  await assert.rejects(store.setLifecycle({ id: current.note.id, expectedRevision: current.revision, lifecycle: 'deleted' }));
});

test('Markdown imports plain text and code, and remaps colliding linked cards as one batch', async () => {
  const plain = importMarkdown('메모.md', '# 메뉴 찾기\n\nDocuments에서 필터 입력');
  assert.equal(plain.type, 'troubleshooting'); assert.equal(plain.title, '메뉴 찾기');
  const command = importMarkdown('명령.md', '# 파일 조회\n```powershell\nGet-ChildItem\n```');
  assert.equal(command.shell, 'powershell'); assert.equal(command.risk, '미확인');
  const note = card(); const work = workflow(note.id);
  const files = [{ name: 'card.md', content: encodeNote(note) }, { name: 'workflow.md', content: encodeNote(work) }];
  const remapped = prepareImports(files, new Set([note.id, work.id]));
  assert.notEqual(remapped[0].id, note.id); assert.equal(remapped[1].steps[0].noteId, remapped[0].id);
  assert.throws(() => prepareImports([files[0], files[0]], new Set()));
  assert.throws(() => importMarkdown('future.md', '---\nschemaVersion: 900\n---\n원문'));
  const { store } = await fixture(); await store.load();
  assert.equal(await store.importMarkdown(files), 2);
  assert.equal(await store.importMarkdown(files), 2);
  const loaded = await store.load(); assert.equal(loaded.records.length, 13);
});

test('ZIP backup restores all lifecycles and state while preserving current machine preferences', async () => {
  const { directory, store } = await fixture();
  const first = await store.load();
  await store.setLifecycle({ id: first.records[0].note.id, expectedRevision: first.records[0].revision, lifecycle: 'deleted' });
  const before = await store.load(); const bytes = await store.backup();
  await store.setFavorite(before.records[1].note.id, false);
  await store.saveAppearance({ dark: true, opacity: 80, mode: 'expanded' });
  const extra = card(); await store.saveNote({ note: extra, expectedRevision: null });
  await store.restoreBackup(bytes);
  const after = await new NoteStore(directory).load();
  assert.deepEqual(after.records.map(record => record.note), before.records.map(record => record.note));
  assert.deepEqual(after.state, before.state); assert.deepEqual(after.appearance, { dark: true, opacity: 80, mode: 'expanded' });
  assert.ok((await fs.readdir(directory)).some(name => name.startsWith('vault-before-restore-')));
});

test('malformed, traversing or broken-reference backup is refused without changing current notes', async () => {
  const { store } = await fixture(); const first = await store.load();
  const bad = zipSync({ '../escape.md': strToU8('bad') });
  assert.throws(() => parseBackup(bad));
  await assert.rejects(store.restoreBackup(bad));
  const note = workflow(randomUUID());
  assert.throws(() => parseBackup(makeBackup([note], { schemaVersion: 1, favorites: [], recent: [] })));
  assert.throws(() => parseBackup(new Uint8Array([1, 2, 3])));
  assert.deepEqual((await store.load()).records, first.records);
});

test('interrupted folder replacement recovers the previous vault on next startup', async () => {
  const { directory, store } = await fixture(); const before = await store.load();
  const previousName = `vault-before-restore-${randomUUID()}`;
  const stagingName = `restore-stage-${randomUUID()}`;
  await fs.rename(store.vaultPath, path.join(directory, previousName));
  await fs.mkdir(path.join(directory, stagingName));
  await fs.writeFile(path.join(directory, 'restore-journal.json'), JSON.stringify({ previousName, stagingName }));
  const after = await new NoteStore(directory).load();
  assert.deepEqual(after.records, before.records);
});

test('workflow validation rejects empty steps, self-links and links to another workflow', async () => {
  assert.equal(noteSchema.safeParse({ ...blankNote(), title: '작업', type: 'workflow' }).success, false);
  const { store } = await fixture(); await store.load();
  const first = workflow(initialNotes[0].id);
  await store.saveNote({ note: first, expectedRevision: null });
  const second = workflow(first.id);
  await assert.rejects(store.saveNote({ note: second, expectedRevision: null }));
  assert.equal(noteSchema.safeParse({ ...first, steps: [{ ...first.steps[0], noteId: first.id }] }).success, false);
});
