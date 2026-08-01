// Shared scroll animation: fades in as content enters the viewport,
// and fades back out if it scrolls out of view (once: false).
export const fadeInOut = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: false, amount: 0.35 },
  transition: { duration: 0.5, ease: 'easeOut' }
};

export const fadeInOutDelay = (delay = 0) => ({
  ...fadeInOut,
  transition: { ...fadeInOut.transition, delay }
});
