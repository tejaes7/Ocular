// Shared scroll animation: fades in once as content enters the viewport.
// This used to be `once: false`, which re-ran every section's enter animation on
// each entry AND exit. Scrolling fast put a dozen of them on the main thread at
// once, and sections that left the viewport mid-animation snapped part-faded.
// `amount` is low so the fade starts as soon as an edge appears rather than
// waiting for a third of a tall section to be on screen.
export const fadeInOut = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.15 },
  transition: { duration: 0.5, ease: 'easeOut' }
};

export const fadeInOutDelay = (delay = 0) => ({
  ...fadeInOut,
  transition: { ...fadeInOut.transition, delay }
});
