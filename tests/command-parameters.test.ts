import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectCommandVariables, fillCommand } from '../shared/commands';
import { blankNote } from '../shared/library';

test('parameter detection keeps first-use order and removes repeated placeholders', () => {
  assert.deepEqual(detectCommandVariables('docker cp {{source_path}} {{container}} {{source_path}} {{_target2}}'), ['source_path', 'container', '_target2']);
});

test('parameter detection leaves Docker Go templates and invalid names alone', () => {
  assert.deepEqual(detectCommandVariables("docker inspect {{container}} --format '{{json .Mounts}} {{.Name}}' {{bad-name}} {{2bad}} {{한글}} {{ name }}"), ['container']);
  assert.deepEqual(detectCommandVariables("docker inspect --format '{{json .Mounts}}'"), []);
});

test('detected parameters produce the complete command while preserving Docker formatting', () => {
  const command = "docker inspect {{container}} --format '{{json .Mounts}}'";
  const variables = detectCommandVariables(command).map(name => ({ name, label: '', required: true }));
  const note = { ...blankNote(), command, variables, shell: 'powershell' as const };
  assert.equal(fillCommand(note, { container: "be service'; $(other)" }), "docker inspect 'be service''; $(other)' --format '{{json .Mounts}}'");
  assert.throws(() => fillCommand(note, {}), /값을 입력/);
});

test('unregistered and unsupported-shell parameters never copy an unresolved command', () => {
  const command = 'git checkout {{branch}}';
  assert.throws(() => fillCommand({ ...blankNote(), command }, { branch: 'main' }), /등록되지/);
  assert.throws(() => fillCommand({ ...blankNote(), command: 'git checkout {{bad-name}}' }, {}), /변수 표기/);
  const variables = detectCommandVariables(command).map(name => ({ name, label: '브랜치', required: true }));
  assert.throws(() => fillCommand({ ...blankNote(), command, variables, shell: 'unknown' }, { branch: 'main' }), /실행 환경/);
  assert.throws(() => fillCommand({ ...blankNote(), command: 'git checkout "{{branch}}"', variables }, { branch: 'main' }), /따옴표/);
});
