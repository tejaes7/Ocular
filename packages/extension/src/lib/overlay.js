/**
 * Positioning for the injected overlay chrome (the button and the panel).
 *
 * Why drag-to-move exists: the button is `position: fixed` in the bottom-right
 * corner, which is exactly where retailers put their own floating controls —
 * Flipkart's chat launcher, Amazon's "Back to top", Myntra's sticky cart bar.
 * An overlay that covers a Buy button is worse than no overlay at all.
 *
 * Three things make this less trivial than it looks:
 *
 *   1. A drag must not fire the button's click handler. DRAG_THRESHOLD_PX
 *      separates the two intents, and a capture-phase listener swallows the
 *      `click` the browser dispatches after a real drag.
 *   2. content.css writes `right`/`bottom` with `!important` — retailer
 *      stylesheets are aggressive enough to need it — so inline geometry has to
 *      be set with `setProperty(..., 'important')` or it silently loses and the
 *      element snaps back to the corner mid-drag.
 *   3. Pointer Events, not mouse events: one code path covers mouse, touch and
 *      pen, and `setPointerCapture` keeps the drag alive when the pointer
 *      outruns the element or passes over one of the page's iframes.
 */

const STORAGE_KEY = 'ui:overlay';

/** Movement below this is a click; at or above it, a drag. */
const DRAG_THRESHOLD_PX = 4;

/** Keep the whole control on screen, with a little breathing room. */
export const EDGE_MARGIN_PX = 8;

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Cached in module scope so re-rendering the button (which replaces the element)
 * doesn't flash it back to the corner while storage is read again.
 */
let cachedPosition = null;
let managed = null;
let resizeBound = false;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function loadPosition() {
  try {
    const bag = await chrome.storage.local.get(STORAGE_KEY);
    return bag[STORAGE_KEY] || null;
  } catch {
    // Extension reloaded; this page's script is orphaned. The corner default is
    // a fine outcome — not worth surfacing.
    return null;
  }
}

async function savePosition(position) {
  cachedPosition = position;
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: position });
  } catch {
    // As above: the position is already applied to the DOM, it just won't
    // survive navigation.
  }
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const sizeOf = (element) => ({ width: element.offsetWidth, height: element.offsetHeight });
const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

/** Room the element can move in without any part of it leaving the screen. */
export function freeSpace(size, view) {
  return {
    x: Math.max(0, view.width - size.width - EDGE_MARGIN_PX),
    y: Math.max(0, view.height - size.height - EDGE_MARGIN_PX),
  };
}

/**
 * Translate a stored position into the current viewport.
 *
 * Positions are saved alongside the viewport they were made in, so a button
 * parked at the right edge of a 2560px monitor stays at the right edge on a
 * 1366px laptop instead of stranding itself mid-screen. Rescaling uses the
 * *free* space (viewport minus the element) rather than raw width, which is what
 * keeps the element fully on screen at both ends of the range.
 *
 * Pure, and takes its dimensions rather than reading the DOM, so the arithmetic
 * that decides whether the button ends up off-screen is directly testable.
 */
export function resolvePosition(stored, size, view) {
  const free = freeSpace(size, view);
  let { x, y } = stored;

  const viewportChanged =
    stored.vw && stored.vh && (stored.vw !== view.width || stored.vh !== view.height);

  if (viewportChanged) {
    // Guard the divisor: a stored viewport no wider than the element itself
    // leaves zero free space, and the ratio would be Infinity or NaN.
    const storedFreeX = Math.max(1, stored.vw - size.width - EDGE_MARGIN_PX);
    const storedFreeY = Math.max(1, stored.vh - size.height - EDGE_MARGIN_PX);
    x = (x / storedFreeX) * free.x;
    y = (y / storedFreeY) * free.y;
  }

  return { x: clamp(x, EDGE_MARGIN_PX, free.x), y: clamp(y, EDGE_MARGIN_PX, free.y) };
}

function applyPosition(element, { x, y }) {
  // `!important` mirrors content.css — see the header note.
  element.style.setProperty('left', `${Math.round(x)}px`, 'important');
  element.style.setProperty('top', `${Math.round(y)}px`, 'important');
  element.style.setProperty('right', 'auto', 'important');
  element.style.setProperty('bottom', 'auto', 'important');
}

/**
 * Re-place the managed element when the window changes size. Without this a
 * button parked near the right edge ends up off-screen the moment someone
 * narrows the window or rotates a tablet.
 */
function bindResize() {
  if (resizeBound) return;
  resizeBound = true;

  window.addEventListener(
    'resize',
    () => {
      if (!managed?.isConnected || !cachedPosition) return;
      applyPosition(managed, resolvePosition(cachedPosition, sizeOf(managed), viewport()));
    },
    { passive: true }
  );
}

// ---------------------------------------------------------------------------
// Dragging
// ---------------------------------------------------------------------------

/**
 * Make an element drag-to-move, persisting where the user leaves it.
 *
 * @param {HTMLElement} element
 * @param {{ onMove?: (position: {x: number, y: number}) => void }} [options]
 *   `onMove` fires on every frame of a drag — used to keep the panel glued to
 *   the button while it moves.
 */
export function makeDraggable(element, { onMove } = {}) {
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;
  let dragging = false;
  let suppressNextClick = false;

  managed = element;
  bindResize();

  // Restore a saved position. Applied synchronously from cache when we already
  // have it, so a re-render doesn't visibly jump.
  if (cachedPosition) {
    applyPosition(element, resolvePosition(cachedPosition, sizeOf(element), viewport()));
  } else {
    loadPosition().then((stored) => {
      if (!stored || !element.isConnected) return;
      cachedPosition = stored;
      applyPosition(element, resolvePosition(stored, sizeOf(element), viewport()));
    });
  }

  element.addEventListener('pointerdown', (event) => {
    // Primary button / first contact only — right-click must still open a menu.
    if (event.button !== 0 || pointerId !== null) return;

    const rect = element.getBoundingClientRect();
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    originX = rect.left;
    originY = rect.top;
    dragging = false;

    // A fresh press starts clean: whatever happened last time is settled.
    suppressNextClick = false;

    // Keeps move/up events coming here even when the pointer outruns the button.
    element.setPointerCapture(event.pointerId);
  });

  element.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (!dragging) {
      // Below the threshold this is still a click in progress. Leaving it alone
      // means a slightly shaky press on a trackpad or touchscreen still works.
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      dragging = true;
      element.classList.add('ocular-dragging');
    }

    // Stops text selection on desktop and page scrolling on touch. Only called
    // once we know it's a drag, so a plain tap keeps its default behaviour.
    event.preventDefault();

    const free = freeSpace(sizeOf(element), viewport());
    const next = {
      x: clamp(originX + dx, EDGE_MARGIN_PX, free.x),
      y: clamp(originY + dy, EDGE_MARGIN_PX, free.y),
    };

    applyPosition(element, next);
    onMove?.(next);
  });

  const endDrag = (event) => {
    if (event.pointerId !== pointerId) return;

    element.releasePointerCapture?.(pointerId);
    pointerId = null;

    if (!dragging) return; // a plain click — let it through untouched
    dragging = false;
    element.classList.remove('ocular-dragging');

    // The browser fires `click` after `pointerup` on the element the press
    // started on. Arm the swallower so finishing a drag over the button doesn't
    // also toggle the panel.
    suppressNextClick = true;

    const rect = element.getBoundingClientRect();
    savePosition({ x: rect.left, y: rect.top, vw: window.innerWidth, vh: window.innerHeight });
  };

  element.addEventListener('pointerup', endDrag);
  element.addEventListener('pointercancel', endDrag);

  // Capture phase, so this runs before the button's own click handler.
  //
  // The flag is consumed exactly once rather than expiring on a timer: if the
  // drag ended off the element no click ever arrives, and the next `pointerdown`
  // clears it — so this can never eat a genuine click later on.
  element.addEventListener(
    'click',
    (event) => {
      if (!suppressNextClick) return;
      suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );
}

/**
 * Park a floating element next to an anchor, flipping and clamping so it stays
 * on screen.
 *
 * The stylesheet pins the panel to the bottom-right corner, which is correct
 * only while the button is still there. Once the button can move, the panel has
 * to follow it.
 */
export function placeNear(element, anchor, { gap = 10 } = {}) {
  const rect = anchor.getBoundingClientRect();
  const size = sizeOf(element);
  const free = freeSpace(size, viewport());

  // Prefer above the anchor; fall below when there isn't room up there.
  const above = rect.top - gap - size.height;
  const top = above >= EDGE_MARGIN_PX ? above : rect.bottom + gap;

  // Right-align to the anchor, which keeps the panel visually attached to a
  // button sitting near the right edge.
  const left = rect.right - size.width;

  applyPosition(element, {
    x: clamp(left, EDGE_MARGIN_PX, free.x),
    y: clamp(top, EDGE_MARGIN_PX, free.y),
  });
}
