import React, { useEffect, useRef } from 'react';

export default function ScrollPriceGraph() {
  const containerRef = useRef(null);
  const pathRef = useRef(null);
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

    path.style.strokeDasharray = `${totalLength}`;
    path.style.strokeDashoffset = `${totalLength}`;

    let targetLength = 0;
    let currentLength = 0;
    let animationFrameId = null;

    const calculateTarget = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
      const vh = window.innerHeight || document.documentElement.clientHeight || 1;

      const scrollHeight = Math.max(
        document.documentElement.scrollHeight || 0,
        document.body.scrollHeight || 0,
        document.documentElement.offsetHeight || 0
      );

      const maxScrollable = Math.max(scrollHeight - vh, 1);
      
      // Hide completely at very top (scrollTop <= 5)
      if (scrollTop <= 5) {
        targetLength = 0;
      } else {
        const ratio = Math.min(Math.max((scrollTop - 5) / maxScrollable, 0), 1);
        targetLength = ratio * totalLength;
      }
    };

    // Responsive Fast 60fps Lerp Loop (0.35 factor for fast, responsive curve following)
    const animate = () => {
      currentLength += (targetLength - currentLength) * 0.35;

      if (Math.abs(targetLength - currentLength) > 0.1) {
        path.style.strokeDashoffset = `${totalLength - currentLength}`;
      } else {
        path.style.strokeDashoffset = `${totalLength - targetLength}`;
      }

      if (arrowGroupRef.current) {
        if (currentLength < 15 || isNaN(currentLength)) {
          arrowGroupRef.current.style.opacity = '0';
        } else {
          arrowGroupRef.current.style.opacity = '1';
          try {
            const pt = path.getPointAtLength(currentLength);
            const ptAhead = path.getPointAtLength(Math.min(currentLength + 6, totalLength));
            const angle = Math.atan2(ptAhead.y - pt.y, ptAhead.x - pt.x) * (180 / Math.PI);

            arrowGroupRef.current.setAttribute(
              'transform',
              `translate(${pt.x}, ${pt.y}) rotate(${angle})`
            );
          } catch (e) {}
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    const handleScroll = () => {
      calculateTarget();
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });

    calculateTarget();
    animate();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-10 overflow-hidden opacity-90" aria-hidden="true">
      <svg
        viewBox="0 0 1200 4200"
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
      >
        <defs>
          {/* Guidance Beam Gradient */}
          <linearGradient id="grace-beam-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0284c7" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#38bdf8" stopOpacity="1" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0.9" />
          </linearGradient>

          {/* Glow Filter */}
          <filter id="grace-glow-subtle" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* GUIDANCE BEAM */}
        <path
          ref={pathRef}
          d={pathD}
          fill="none"
          stroke="url(#grace-beam-grad)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#grace-glow-subtle)"
          style={{ transition: 'none' }}
        />

        {/* SLEEK THIN CYAN ARROWHEAD POINTER (No White Color) */}
        <g ref={arrowGroupRef} style={{ opacity: 0, transition: 'opacity 0.2s' }}>
          <path
            d="M 16,0 L -2,-4 L 3,0 L -2,4 Z"
            fill="#38bdf8"
            stroke="#0284c7"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="drop-shadow(0 0 6px #0284c7)"
          />
        </g>
      </svg>
    </div>
  );
}
