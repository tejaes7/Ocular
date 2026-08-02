/**
 * Where the dragged overlay ends up.
 *
 * The failure this guards against is silent and total: a button restored
 * off-screen is indistinguishable from an extension that stopped working, and
 * the user has no way to drag back something they cannot see. Viewports change
 * constantly in normal use — a laptop undocked from a monitor, a window snapped
 * to half width, a tablet rotated — so the restore path has to survive a stored
 * position made in a viewport that no longer exists.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EDGE_MARGIN_PX, freeSpace, resolvePosition } from '../src/lib/overlay.js';

/** Roughly the real button: a 38px-tall pill. */
const BUTTON = { width: 150, height: 38 };

const DESKTOP = { width: 2560, height: 1400 };
const LAPTOP = { width: 1366, height: 768 };

/** A position saved in `view`, at pixel offsets x/y. */
const savedIn = (view, x, y) => ({ x, y, vw: view.width, vh: view.height });

const within = (position, size, view) =>
  position.x >= 0 &&
  position.y >= 0 &&
  position.x + size.width <= view.width &&
  position.y + size.height <= view.height;

test('a position saved in the current viewport is returned unchanged', () => {
  const stored = savedIn(LAPTOP, 400, 300);
  const resolved = resolvePosition(stored, BUTTON, LAPTOP);

  assert.deepEqual(resolved, { x: 400, y: 300 });
});

test('a button parked at the right edge stays at the right edge on a smaller screen', () => {
  const free = freeSpace(BUTTON, DESKTOP);
  const stored = savedIn(DESKTOP, free.x, free.y); // hard against the corner

  const resolved = resolvePosition(stored, BUTTON, LAPTOP);
  const laptopFree = freeSpace(BUTTON, LAPTOP);

  assert.equal(resolved.x, laptopFree.x, 'should still be flush right');
  assert.equal(resolved.y, laptopFree.y, 'should still be flush bottom');
});

test('a position from a much larger viewport never lands off-screen', () => {
  // The regression that motivated the rescale: raw pixel offsets from a 2560px
  // monitor put the button ~1200px past the right edge of a laptop screen.
  const stored = savedIn(DESKTOP, 2300, 1300);
  const resolved = resolvePosition(stored, BUTTON, LAPTOP);

  assert.ok(
    within(resolved, BUTTON, LAPTOP),
    `expected the button inside ${LAPTOP.width}x${LAPTOP.height}, got ${JSON.stringify(resolved)}`
  );
});

test('rescaling preserves roughly where in the screen the user left it', () => {
  const desktopFree = freeSpace(BUTTON, DESKTOP);
  const stored = savedIn(DESKTOP, desktopFree.x / 2, desktopFree.y / 2); // centred

  const resolved = resolvePosition(stored, BUTTON, LAPTOP);
  const laptopFree = freeSpace(BUTTON, LAPTOP);

  assert.equal(resolved.x, laptopFree.x / 2);
  assert.equal(resolved.y, laptopFree.y / 2);
});

test('the edge margin is honoured at the top-left', () => {
  const resolved = resolvePosition(savedIn(LAPTOP, -500, -500), BUTTON, LAPTOP);

  assert.deepEqual(resolved, { x: EDGE_MARGIN_PX, y: EDGE_MARGIN_PX });
});

test('a viewport narrower than the button still yields a usable position', () => {
  // Free space is zero here, so min > max in the clamp. It must not return NaN
  // or a negative offset — a tiny window is a bad experience, not a broken one.
  const tiny = { width: 120, height: 60 };
  const resolved = resolvePosition(savedIn(DESKTOP, 2000, 1200), BUTTON, tiny);

  assert.ok(Number.isFinite(resolved.x) && Number.isFinite(resolved.y));
  assert.ok(resolved.x >= 0 && resolved.y >= 0);
});

test('a legacy position with no recorded viewport is clamped, not rescaled', () => {
  // Positions written before `vw`/`vh` existed, and anything hand-edited.
  const resolved = resolvePosition({ x: 9999, y: 9999 }, BUTTON, LAPTOP);
  const free = freeSpace(BUTTON, LAPTOP);

  assert.deepEqual(resolved, { x: free.x, y: free.y });
});
