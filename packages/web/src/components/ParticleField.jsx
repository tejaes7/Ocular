import React, { useEffect, useRef } from 'react';

/**
 * Drifting dust field behind the page.
 *
 * Depth comes from three layers that differ in dot size, opacity and how far
 * they shift with the pointer — near dots travel further than far ones, which is
 * the parallax cue the eye reads as 3D. The pointer also pushes dots gently aside.
 *
 * Drawn as three batched fills per frame rather than one path per dot, so the
 * cost stays flat as the count grows.
 */

const LAYERS = [
  { share: 0.5, minSize: 0.5, maxSize: 1.0, alpha: 0.1, parallax: 7, speed: 0.55 },
  { share: 0.32, minSize: 0.9, maxSize: 1.7, alpha: 0.15, parallax: 16, speed: 0.85 },
  { share: 0.18, minSize: 1.5, maxSize: 2.6, alpha: 0.2, parallax: 30, speed: 1.15 },
];

const DOT_COLOR = '#2c3e56';
const REPEL_RADIUS = 130;
const REPEL_STRENGTH = 26;

/** Box–Muller, so dots cluster around the band instead of spreading evenly. */
function gaussian() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export default function ParticleField() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

    let width = 0;
    let height = 0;
    let layers = [];
    let frameId = null;
    let lastTime = 0;

    // Pointer target vs. the eased value actually drawn, so the field glides
    // after the cursor instead of snapping to it.
    let pointerX = -9999;
    let pointerY = -9999;
    let easedX = -9999;
    let easedY = -9999;
    let hasPointer = false;

    const build = () => {
      width = window.innerWidth;
      height = window.innerHeight;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Scale with area so a laptop isn't drawing a phone's worth of dots, but
      // cap it so a 4K monitor doesn't quietly triple the per-frame work.
      const total = Math.min(950, Math.round((width * height) / 2600));

      layers = LAYERS.map((layer) => {
        const count = Math.round(total * layer.share);
        const dots = Array.from({ length: count });
        for (let i = 0; i < count; i++) {
          const x = Math.random() * width;
          // A shallow wave gives the field a spine, echoing a dust cloud rather
          // than looking like even static.
          const band = height * 0.5 + Math.sin((x / width) * Math.PI * 1.3) * height * 0.13;
          dots[i] = {
            x,
            y: band + gaussian() * height * 0.26,
            size: layer.minSize + Math.random() * (layer.maxSize - layer.minSize),
            vx: (Math.random() - 0.5) * 0.05 * layer.speed,
            vy: (Math.random() - 0.5) * 0.035 * layer.speed,
          };
        }
        return { ...layer, dots };
      });
    };

    const draw = (delta) => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = DOT_COLOR;

      // 60fps-normalised, so drift speed doesn't depend on refresh rate.
      const step = delta / (1000 / 60);
      const px = hasPointer ? easedX : -9999;
      const py = hasPointer ? easedY : -9999;
      const offsetX = hasPointer ? (easedX / width - 0.5) * 2 : 0;
      const offsetY = hasPointer ? (easedY / height - 0.5) * 2 : 0;

      for (const layer of layers) {
        const shiftX = offsetX * layer.parallax;
        const shiftY = offsetY * layer.parallax;

        ctx.globalAlpha = layer.alpha;
        ctx.beginPath();

        for (const dot of layer.dots) {
          dot.x += dot.vx * step;
          dot.y += dot.vy * step;

          // Wrap with margin so dots don't pop at the edges.
          if (dot.x < -20) dot.x = width + 20;
          else if (dot.x > width + 20) dot.x = -20;
          if (dot.y < -20) dot.y = height + 20;
          else if (dot.y > height + 20) dot.y = -20;

          let x = dot.x + shiftX;
          let y = dot.y + shiftY;

          const dx = x - px;
          const dy = y - py;
          const distSq = dx * dx + dy * dy;
          if (distSq < REPEL_RADIUS * REPEL_RADIUS) {
            const dist = Math.sqrt(distSq) || 1;
            const push = (1 - dist / REPEL_RADIUS) * REPEL_STRENGTH;
            x += (dx / dist) * push;
            y += (dy / dist) * push;
          }

          ctx.rect(x, y, dot.size, dot.size);
        }

        ctx.fill();
      }

      ctx.globalAlpha = 1;
    };

    const tick = (now) => {
      const delta = Math.min(now - lastTime || 16.7, 50);
      lastTime = now;

      easedX += (pointerX - easedX) * 0.08;
      easedY += (pointerY - easedY) * 0.08;

      draw(delta);
      frameId = requestAnimationFrame(tick);
    };

    const start = () => {
      if (frameId !== null || reduceMotion?.matches) return;
      lastTime = performance.now();
      frameId = requestAnimationFrame(tick);
    };

    const stop = () => {
      if (frameId === null) return;
      cancelAnimationFrame(frameId);
      frameId = null;
    };

    const onPointerMove = (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!hasPointer) {
        hasPointer = true;
        easedX = pointerX;
        easedY = pointerY;
      }
    };

    const onPointerLeave = () => {
      hasPointer = false;
    };

    // A background nobody can see should not be burning frames.
    const onVisibility = () => (document.hidden ? stop() : start());

    let resizeTimer = null;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        build();
        if (reduceMotion?.matches) draw(16.7);
      }, 150);
    };

    build();

    if (reduceMotion?.matches) {
      draw(16.7); // one static frame, no loop
    } else {
      start();
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      clearTimeout(resizeTimer);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-70"
    />
  );
}
