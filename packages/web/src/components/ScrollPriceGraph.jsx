import React, { useEffect, useRef } from 'react';

export default function ScrollPriceGraph() {
  const containerRef = useRef(null);
  const pathRef = useRef(null);
  const haloPathRef = useRef(null);
  const glowPathRef = useRef(null);
  const arrowGroupRef = useRef(null);

  // Extended Organic Sweeping Curved Path (Flows down behind Footer)
  const pathD = `
    M 120, 180
    C 700, 320  1080, 600  1080, 950
    C 1080, 1350  100, 1450  100, 1800
    C 100, 2200  1100, 2250  1100, 2650
    C 1100, 3050  350, 3200  350, 3600
    C 350, 3900  800, 4000  800, 4200
  `;

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;

    let totalLength = 0;
    try {
      totalLength = path.getTotalLength();
    } catch (e) {
      return;
    }
    if (!totalLength || isNaN(totalLength)) return;

    // All three beam layers share the same geometry, so they share one dash.
    const beamPaths = [glowPathRef.current, haloPathRef.current, path].filter(Boolean);
    for (const layer of beamPaths) {
      layer.style.strokeDasharray = `${totalLength}`;
      layer.style.strokeDashoffset = `${totalLength}`;
    }

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

    let targetLength = 0;
    let currentLength = 0;
    let animationFrameId = null;
    let lastFrameTime = 0;

    // scrollHeight/offsetHeight force a synchronous layout to read. They only
    // change when the page is resized, so measure there instead of paying for
    // it on every scroll event.
    let maxScrollable = 1;
    // preserveAspectRatio="none" scales x and y by different amounts, so a tangent
    // computed in viewBox space points the wrong way on screen. Cache the two
    // scale factors and correct the arrow with them.
    let scaleX = 1;
    let scaleY = 1;

    const measure = () => {
      const vh = window.innerHeight || document.documentElement.clientHeight || 1;
      const scrollHeight = Math.max(
        document.documentElement.scrollHeight || 0,
        document.body.scrollHeight || 0,
        document.documentElement.offsetHeight || 0
      );
      maxScrollable = Math.max(scrollHeight - vh, 1);

      const ctm = path.ownerSVGElement?.getScreenCTM?.();
      if (ctm && ctm.a && ctm.d) {
        scaleX = ctm.a;
        scaleY = ctm.d;
      }
    };

    const calculateTarget = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

      // Hide completely at very top (scrollTop <= 5)
      if (scrollTop <= 5) {
        targetLength = 0;
      } else {
        const ratio = Math.min(Math.max((scrollTop - 5) / maxScrollable, 0), 1);
        targetLength = ratio * totalLength;
      }
    };

    const draw = (length) => {
      const offset = `${totalLength - length}`;
      for (const layer of beamPaths) {
        layer.style.strokeDashoffset = offset;
      }

      const arrow = arrowGroupRef.current;
      if (!arrow) return;

      if (length < 15 || isNaN(length)) {
        arrow.style.opacity = '0';
        return;
      }

      arrow.style.opacity = '1';
      try {
        const pt = path.getPointAtLength(length);
        const ptAhead = path.getPointAtLength(Math.min(length + 6, totalLength));

        // Tangent in screen space, then undo the parent's non-uniform scale so the
        // arrowhead stays the same shape and size wherever it is on the curve.
        const angle =
          Math.atan2((ptAhead.y - pt.y) * scaleY, (ptAhead.x - pt.x) * scaleX) * (180 / Math.PI);

        arrow.setAttribute(
          'transform',
          `translate(${pt.x}, ${pt.y}) scale(${1 / scaleX}, ${1 / scaleY}) rotate(${angle})`
        );
      } catch (e) {}
    };

    // A fixed lerp per frame converges twice as fast on a 144Hz display as on a
    // 60Hz one. Scaling by elapsed time keeps the response identical whatever the
    // refresh rate. Raised from 0.35 so a fast flick doesn't leave the beam
    // visibly trailing the scroll position.
    const SMOOTHING_PER_60HZ_FRAME = 0.55;
    const animate = (now) => {
      const delta = Math.min(now - lastFrameTime || 16.7, 50);
      lastFrameTime = now;

      const factor = 1 - Math.pow(1 - SMOOTHING_PER_60HZ_FRAME, delta / (1000 / 60));
      currentLength += (targetLength - currentLength) * factor;

      // Settled: draw the exact target and stop. The original loop kept calling
      // getPointAtLength() every frame forever, which re-rasterised the SVG even
      // when the page was completely still.
      if (Math.abs(targetLength - currentLength) <= 0.1) {
        currentLength = targetLength;
        draw(currentLength);
        animationFrameId = null;
        return;
      }

      draw(currentLength);
      animationFrameId = requestAnimationFrame(animate);
    };

    const start = () => {
      if (animationFrameId !== null) return;
      lastFrameTime = performance.now();
      animationFrameId = requestAnimationFrame(animate);
    };

    const handleScroll = () => {
      calculateTarget();
      if (reduceMotion?.matches) {
        currentLength = targetLength;
        draw(currentLength);
        return;
      }
      start();
    };

    const handleResize = () => {
      measure();
      handleScroll();
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    // Lazy-loaded store logos change the page height after first paint.
    window.addEventListener('load', handleResize);

    measure();
    calculateTarget();
    currentLength = targetLength;
    draw(currentLength);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('load', handleResize);
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden opacity-90"
      style={{ contain: 'paint' }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1200 4200"
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
      >
        <defs>
          {/* Guidance Beam Gradient. Navy sampled from the brand wordmark. */}
          <linearGradient id="grace-beam-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#64acef" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#7bb9f2" stopOpacity="1" />
            <stop offset="100%" stopColor="#64acef" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* GUIDANCE BEAM
            The glow used to be an feGaussianBlur over a 140% filter region. This
            SVG is the full height of the document, so that was a ~6.6 megapixel
            blur re-run on every frame the dash offset moved. Three stacked
            strokes give the same soft edge for the cost of two extra paths.

            Do not add vector-effect="non-scaling-stroke" here. It also reinterprets
            stroke-dasharray in screen space, while getPointAtLength() below stays in
            viewBox space (6098 units vs 5336px for this path) — the drawn line end
            and the arrowhead then index different coordinate systems and visibly
            drift apart as you scroll. */}
        <path
          ref={glowPathRef}
          d={pathD}
          fill="none"
          stroke="url(#grace-beam-grad)"
          strokeWidth="16"
          strokeOpacity="0.13"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transition: 'none' }}
        />
        <path
          ref={haloPathRef}
          d={pathD}
          fill="none"
          stroke="url(#grace-beam-grad)"
          strokeWidth="8"
          strokeOpacity="0.3"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transition: 'none' }}
        />
        <path
          ref={pathRef}
          d={pathD}
          fill="none"
          stroke="url(#grace-beam-grad)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transition: 'none' }}
        />

        {/* Arrowhead pointer riding the end of the drawn beam */}
        <g ref={arrowGroupRef} style={{ opacity: 0, transition: 'opacity 0.2s' }}>
          <path
            d="M 16,0 L -2,-4 L 3,0 L -2,4 Z"
            fill="#7bb9f2"
            stroke="#64acef"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </div>
  );
}
