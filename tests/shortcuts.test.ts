import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LibraryError } from '../shared/library';
import ShortcutController, { normalizeShortcut, readShortcutPreferences, type ShortcutAction, type ShortcutPreferences } from '../electron/main/shortcuts';

function fixture(raw?: unknown, persist: (value: ShortcutPreferences) => Promise<void> = async () => undefined) {
  const active = new Map<string, () => void>();
  const conflicts = new Set<string>();
  const calls: string[] = [];
  const writes: ShortcutPreferences[] = [];
  const invoked: ShortcutAction[] = [];
  const controller = new ShortcutController({
    register(value, callback) { calls.push(`register:${value}`); if (conflicts.has(value) || active.has(value)) return false; active.set(value, callback); return true; },
    unregister(value) { calls.push(`unregister:${value}`); active.delete(value); },
  }, async value => { await persist(value); writes.push({ ...value }); }, { show: () => invoked.push('show'), toggle: () => invoked.push('toggle') });
  controller.initialize(raw);
  return { controller, active, conflicts, calls, writes, invoked };
}

test('shortcut normalization makes modifier aliases, case, whitespace, and order equivalent', () => {
  assert.equal(normalizeShortcut(' alt + CONTROL + k '), 'Ctrl+Alt+K');
  assert.equal(normalizeShortcut('shift+CmdOrCtrl+space'), 'Ctrl+Shift+Space');
  assert.equal(normalizeShortcut('win+Ctrl+F24'), 'Ctrl+Super+F24');
  assert.equal(normalizeShortcut('   '), '');
  for (const invalid of ['Shift+M', 'Ctrl+Control+M', 'Ctrl++M', 'Ctrl+Enter', 'Ctrl+F25', 'constructor+K', '__proto__+K', 'M', null, 20]) assert.throws(() => normalizeShortcut(invalid), LibraryError);
});

test('legacy preferences keep custom show shortcuts and add the mode shortcut without stealing a binding', () => {
  assert.deepEqual(readShortcutPreferences({ accelerator: 'Control+Shift+Space' }), { accelerator: 'Ctrl+Shift+Space', toggleAccelerator: 'Ctrl+Alt+M' });
  assert.deepEqual(readShortcutPreferences({ accelerator: 'Alt+Ctrl+M' }), { accelerator: 'Ctrl+Alt+M', toggleAccelerator: '' });
  assert.deepEqual(readShortcutPreferences({ accelerator: '', toggleAccelerator: '' }), { accelerator: '', toggleAccelerator: '' });
  assert.deepEqual(readShortcutPreferences({ accelerator: false, toggleAccelerator: 'bad' }), { accelerator: 'Ctrl+Alt+K', toggleAccelerator: 'Ctrl+Alt+M' });
});

test('both registered actions invoke their own callback and normalized duplicates preserve existing bindings', async () => {
  const context = fixture();
  context.active.get('Ctrl+Alt+K')!();
  context.active.get('Ctrl+Alt+M')!();
  assert.deepEqual(context.invoked, ['show', 'toggle']);
  await assert.rejects(context.controller.set('toggle', 'Alt+Control+k'), { code: 'CONFLICT' });
  assert.deepEqual([...context.active.keys()].sort(), ['Ctrl+Alt+K', 'Ctrl+Alt+M']);
  assert.equal(context.writes.length, 0);
  await context.controller.set('show', 'alt+control+k');
  assert.equal(context.calls.length, 2, 'equivalent existing shortcut does not re-register');
});

test('a shortcut owned by another program does not remove the current shortcut or overwrite preferences', async () => {
  const context = fixture();
  context.conflicts.add('Ctrl+Shift+Space');
  await assert.rejects(context.controller.set('show', 'Ctrl+Shift+Space'), { code: 'CONFLICT' });
  assert.equal(context.controller.state().accelerator, 'Ctrl+Alt+K');
  assert.equal(context.active.has('Ctrl+Alt+K'), true);
  assert.equal(context.writes.length, 0);
});

test('a failed preference write unregisters only the new shortcut and allows later changes', async () => {
  let fail = true;
  const context = fixture(undefined, async () => { if (fail) throw new Error('disk unavailable'); });
  await assert.rejects(context.controller.set('toggle', 'Ctrl+Shift+M'), /disk unavailable/);
  assert.equal(context.active.has('Ctrl+Shift+M'), false);
  assert.equal(context.active.has('Ctrl+Alt+M'), true);
  assert.equal(context.controller.state().toggleAccelerator, 'Ctrl+Alt+M');
  fail = false;
  await context.controller.set('toggle', 'Ctrl+Shift+M');
  assert.equal(context.active.has('Ctrl+Alt+M'), false);
  assert.equal(context.active.has('Ctrl+Shift+M'), true);
});

test('disabling one shortcut persists both preferences and leaves the other action registered', async () => {
  const context = fixture();
  const state = await context.controller.set('show', '');
  assert.equal(state.accelerator, '');
  assert.equal(state.registered, false);
  assert.equal(state.toggleRegistered, true);
  assert.deepEqual(context.writes, [{ accelerator: '', toggleAccelerator: 'Ctrl+Alt+M' }]);
  assert.deepEqual([...context.active.keys()], ['Ctrl+Alt+M']);
});

test('concurrent changes serialize and each saved file contains the other action’s committed value', async () => {
  let release!: () => void;
  const firstWrite = new Promise<void>(resolve => { release = resolve; });
  let writeCount = 0;
  const context = fixture(undefined, async () => { if (++writeCount === 1) await firstWrite; });
  const changeShow = context.controller.set('show', 'Ctrl+Shift+K');
  const changeMode = context.controller.set('toggle', 'Ctrl+Shift+M');
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(writeCount, 1);
  assert.equal(context.active.has('Ctrl+Shift+M'), false);
  release();
  await Promise.all([changeShow, changeMode]);
  assert.deepEqual(context.writes, [{ accelerator: 'Ctrl+Shift+K', toggleAccelerator: 'Ctrl+Alt+M' }, { accelerator: 'Ctrl+Shift+K', toggleAccelerator: 'Ctrl+Shift+M' }]);
  assert.deepEqual([...context.active.keys()].sort(), ['Ctrl+Shift+K', 'Ctrl+Shift+M']);
});

test('concurrent claims to the same normalized shortcut have one winner and retain the losing action', async () => {
  const context = fixture();
  const results = await Promise.allSettled([context.controller.set('show', 'Ctrl+Shift+Space'), context.controller.set('toggle', 'shift+Control+space')]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.deepEqual([...context.active.keys()].sort(), ['Ctrl+Alt+M', 'Ctrl+Shift+Space']);
});

test('startup registration failure remains visible and can be retried without losing the other action', async () => {
  const active = new Map<string, () => void>();
  let blocked = true;
  const controller = new ShortcutController({ register(value, callback) { if (value === 'Ctrl+Alt+K' && blocked) return false; active.set(value, callback); return true; }, unregister: value => { active.delete(value); } }, async () => undefined, { show() {}, toggle() {} });
  assert.equal(controller.initialize().registered, false);
  assert.equal(controller.state().toggleRegistered, true);
  blocked = false;
  assert.equal((await controller.set('show', 'Ctrl+Alt+K')).registered, true);
  controller.dispose();
  assert.equal(active.size, 0);
  await assert.rejects(controller.set('show', 'Ctrl+Shift+K'), { code: 'IO_ERROR' });
});
