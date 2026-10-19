import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appearanceSchema, defaultAppearance, windowLayoutSchema } from '../shared/library';
import { clampWindowBounds, simpleWindowHeight, WindowLayouts } from '../shared/window-layout';

const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
const expanded = { x: 240, y: 80, width: 820, height: 920 };
const simple = { mode: 'simple' as const, hasQuery: false, resultCount: 0 };
const full = { mode: 'expanded' as const, hasQuery: false, resultCount: 0 };

test('appearance files without a mode retain the previous expanded experience', () => {
  assert.deepEqual(appearanceSchema.parse({ dark: true, opacity: 70 }), { dark: true, opacity: 70, mode: 'expanded' });
  assert.equal(defaultAppearance.mode, 'expanded');
  assert.equal(windowLayoutSchema.safeParse({ ...simple, resultCount: -1 }).success, false);
  assert.equal(windowLayoutSchema.safeParse({ ...simple, resultCount: 1.5 }).success, false);
  assert.equal(windowLayoutSchema.safeParse({ ...simple, mode: 'unknown' }).success, false);
});

test('a blank query is search-only, zero matches remain readable, and results cap at six rows', () => {
  assert.equal(simpleWindowHeight({ hasQuery: false, resultCount: 20 }), 96);
  assert.equal(simpleWindowHeight({ hasQuery: true, resultCount: 0 }), 192);
  assert.equal(simpleWindowHeight({ hasQuery: true, resultCount: 3 }), 320);
  assert.equal(simpleWindowHeight({ hasQuery: true, resultCount: 6 }), 512);
  assert.equal(simpleWindowHeight({ hasQuery: true, resultCount: 200 }), 512);
  assert.equal(simpleWindowHeight({ hasQuery: true, resultCount: 6, contentHeight: 440 }), 440);
  assert.equal(simpleWindowHeight({ hasQuery: false, resultCount: 0, contentHeight: 900 }), 640);
});

test('bounds fit monitors with negative coordinates and smaller work areas', () => {
  assert.deepEqual(clampWindowBounds({ x: -2100, y: -50, width: 640, height: 860 }, { x: -1920, y: 0, width: 1920, height: 1040 }), { x: -1920, y: 0, width: 640, height: 860 });
  const area = { x: 20, y: 30, width: 400, height: 500 };
  const plan = new WindowLayouts(expanded).update(full, expanded, area);
  assert.deepEqual(plan.bounds, area);
  assert.equal(plan.minimumWidth, 400);
  assert.equal(plan.minimumHeight, 500);
});

test('switching modes restores the expanded size and position after manual resizing', () => {
  const layouts = new WindowLayouts(expanded);
  const compact = layouts.update(simple, expanded, workArea);
  assert.equal(compact.bounds.width, 640);
  assert.equal(compact.bounds.height, 96);
  assert.equal(compact.minimumHeight, 96);
  assert.deepEqual(layouts.update(full, compact.bounds, workArea).bounds, expanded);
  const resized = { x: 100, y: 120, width: 740, height: 800 };
  layouts.recordManualBounds(resized);
  const again = layouts.update(simple, resized, workArea);
  const restored = layouts.update(full, again.bounds, workArea);
  assert.deepEqual(restored.bounds, resized);
  assert.equal(restored.minimumHeight, 600);
});

test('temporary result-height clamping does not permanently move the simple anchor', () => {
  const layouts = new WindowLayouts(expanded);
  layouts.update(simple, expanded, workArea);
  const moved = { x: 500, y: 900, width: 700, height: 96 };
  layouts.recordManualBounds(moved);
  const result = layouts.update({ ...simple, hasQuery: true, resultCount: 6 }, moved, workArea);
  assert.equal(result.bounds.y, 528);
  const cleared = layouts.update(simple, result.bounds, workArea);
  assert.deepEqual(cleared.bounds, moved);
});

test('manual movement while results are shown establishes a new simple position', () => {
  const layouts = new WindowLayouts(expanded);
  const initial = layouts.update({ ...simple, hasQuery: true, resultCount: 6 }, expanded, workArea);
  const moved = { ...initial.bounds, x: 700, y: 300, width: 760 };
  layouts.recordManualBounds(moved);
  assert.deepEqual(layouts.update(simple, moved, workArea).bounds, { x: 700, y: 300, width: 760, height: 96 });
});

test('expanded and simple modes retain their own display positions', () => {
  const layouts = new WindowLayouts(expanded);
  layouts.update(simple, expanded, workArea);
  const secondScreen = { x: -1920, y: 0, width: 1920, height: 1040 };
  const moved = { x: -1200, y: 100, width: 640, height: 96 };
  layouts.recordManualBounds(moved);
  assert.deepEqual(layouts.referenceBounds('expanded', moved), expanded);
  assert.deepEqual(layouts.update(full, moved, workArea).bounds, expanded);
  assert.deepEqual(layouts.referenceBounds('simple', expanded), moved);
  assert.deepEqual(layouts.update(simple, expanded, secondScreen).bounds, moved);
});
