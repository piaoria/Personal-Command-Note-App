import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findAppCommands, findAppShortcut } from '../shared/app-commands';

test('mode commands can be discovered by English prefix or Korean name', () => {
  assert.equal(findAppCommands('/').length, 4);
  assert.deepEqual(findAppCommands(' /SIM ').map(command => command.id), ['simple']);
  assert.deepEqual(findAppCommands('/확장').map(command => command.id), ['expanded']);
});

test('filesystem paths, shell commands and trailing executable text are not app actions', () => {
  for (const query of ['/var/log', 'docker ps', '/simple && echo hi', '/expanded --help', '']) assert.deepEqual(findAppCommands(query), []);
});

test('app shortcuts use the same physical keys with Korean and English input', () => {
  const modifiers = { ctrlKey: true, metaKey: false, shiftKey: true, altKey: false };
  for (const key of ['M', 'm', 'ㅡ']) assert.equal(findAppShortcut({ ...modifiers, key, code: 'KeyM' }), 'toggle-mode');
  assert.equal(findAppShortcut({ ...modifiers, shiftKey: false, key: 'ㅏ', code: 'KeyK' }), 'search');
});

test('unmodified letters, AltGr and other physical keys do not trigger mode changes', () => {
  const modifiers = { ctrlKey: true, metaKey: false, shiftKey: true, altKey: false };
  assert.equal(findAppShortcut({ ...modifiers, ctrlKey: false, key: 'm', code: 'KeyM' }), null);
  assert.equal(findAppShortcut({ ...modifiers, shiftKey: false, key: 'm', code: 'KeyM' }), null);
  assert.equal(findAppShortcut({ ...modifiers, altKey: true, key: 'm', code: 'KeyM' }), null);
  assert.equal(findAppShortcut({ ...modifiers, key: 'm', code: 'KeyX' }), null);
  assert.equal(findAppShortcut({ ...modifiers, key: 'M', code: '' }), 'toggle-mode');
});
