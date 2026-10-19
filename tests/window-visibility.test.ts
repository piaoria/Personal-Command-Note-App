import assert from 'node:assert/strict';
import { test } from 'node:test';
import toggleWindowVisibility, { type VisibilityWindow } from '../electron/main/window-visibility';

function fixture(state: { visible?: boolean; focused?: boolean; minimized?: boolean; destroyed?: boolean; trayAvailable?: boolean } = {}) {
  const calls: string[] = [];
  const current = { visible: true, focused: true, minimized: false, destroyed: false, ...state };
  const target: VisibilityWindow = {
    isDestroyed: () => current.destroyed,
    isMinimized: () => current.minimized,
    isVisible: () => current.visible,
    isFocused: () => current.focused,
    hide() { calls.push('hide'); current.visible = false; current.focused = false; },
    minimize() { calls.push('minimize'); current.minimized = true; current.focused = false; },
  };
  const actions = {
    trayAvailable: state.trayAvailable ?? true,
    show() { calls.push('show-search'); current.visible = true; current.focused = true; current.minimized = false; },
  };
  return { target, actions, calls, current };
}

test('the global search shortcut hides a focused window and shows it on the next press', () => {
  const context = fixture();
  assert.equal(toggleWindowVisibility(context.target, context.actions), 'hidden');
  assert.deepEqual(context.calls, ['hide']);
  assert.equal(toggleWindowVisibility(context.target, context.actions), 'shown');
  assert.deepEqual(context.calls, ['hide', 'show-search']);
});

test('hidden and minimized windows invoke the existing restore, show, focus, and search action', () => {
  for (const state of [{ visible: false }, { minimized: true }, { visible: false, minimized: true }]) {
    const context = fixture(state);
    assert.equal(toggleWindowVisibility(context.target, context.actions), 'shown');
    assert.deepEqual(context.calls, ['show-search']);
    assert.equal(context.current.visible, true);
    assert.equal(context.current.focused, true);
    assert.equal(context.current.minimized, false);
  }
});

test('a visible window behind another application is brought forward instead of hidden', () => {
  const context = fixture({ focused: false });
  assert.equal(toggleWindowVisibility(context.target, context.actions), 'shown');
  assert.deepEqual(context.calls, ['show-search']);
  assert.equal(context.current.focused, true);
  assert.equal(toggleWindowVisibility(context.target, context.actions), 'hidden');
  assert.deepEqual(context.calls, ['show-search', 'hide']);
});

test('without a tray the focused window minimizes and can be reopened with the same shortcut', () => {
  const context = fixture({ trayAvailable: false });
  assert.equal(toggleWindowVisibility(context.target, context.actions), 'minimized');
  assert.deepEqual(context.calls, ['minimize']);
  assert.equal(toggleWindowVisibility(context.target, context.actions), 'shown');
  assert.deepEqual(context.calls, ['minimize', 'show-search']);
});

test('a missing or destroyed window does not dispatch search or visibility actions', () => {
  const context = fixture({ destroyed: true });
  assert.equal(toggleWindowVisibility(null, context.actions), 'unavailable');
  assert.equal(toggleWindowVisibility(context.target, context.actions), 'unavailable');
  assert.deepEqual(context.calls, []);
});
