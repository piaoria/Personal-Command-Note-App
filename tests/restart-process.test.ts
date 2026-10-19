import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('separate Node processes save then restore a note and library state', async () => {
  const root = path.resolve('.test-data');
  await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, 'process-restart-'));
  const common = `import { NoteStore } from './electron/main/note-store.ts'; const store = new NoteStore(process.env.RESTART_TEST_DATA);`;
  const execute = (source: string) => {
    const process = spawnSync(globalThis.process.execPath, ['--import', 'tsx', '--input-type=module', '-e', common + source], {
      cwd: globalThis.process.cwd(), env: { ...globalThis.process.env, RESTART_TEST_DATA: directory }, encoding: 'utf8', timeout: 20_000,
    });
    assert.equal(process.status, 0, process.stderr || String(process.error));
    return JSON.parse(process.stdout.trim());
  };
  const saved = execute(`const snapshot = await store.load(); const original = snapshot.records[0]; const saved = await store.saveNote({ note: { ...original.note, title: '프로세스 재실행 테스트', command: 'Get-ChildItem "C:\\\\한글 폴더"' }, expectedRevision: original.revision }); await store.setFavorite(saved.note.id, false); await store.touchRecent(saved.note.id); await store.saveAppearance({ dark: true, opacity: 80, mode: 'simple' }); console.log(JSON.stringify(saved));`);
  const restored = execute(`console.log(JSON.stringify(await store.load()));`);
  assert.deepEqual(restored.records.find((record: { note: { id: string } }) => record.note.id === saved.note.id), saved);
  assert.ok(!restored.state.favorites.includes(saved.note.id));
  assert.equal(restored.state.recent[0], saved.note.id);
  assert.deepEqual(restored.appearance, { dark: true, opacity: 80, mode: 'simple' });
});
