import React, { useEffect, useRef, useState } from 'react';

/**
 * Full-bleed looping video behind the page.
 *
 * Drop the file at packages/web/public/background.mp4 and this picks it up. If
 * the file is absent the component renders nothing rather than leaving a broken
 * <video> box, so the page is never worse off for it missing.
 *
 * `blend` matters more than it looks. The site background is white:
 *   - dark particles on a white/light plate  -> "multiply" (white drops out cleanly)
 *   - light particles on a black plate       -> "screen" reads wrong on white;
 *                                               use "difference", or re-export
 *                                               the clip with an alpha channel
 * Pick once you can see the actual footage.
 */
export default function VideoBackground({
  src = '/background.mp4',
  poster,
  opacity = 0.35,
  blend = 'multiply',
}) {
  const videoRef = useRef(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (reduceMotion?.matches) {
      video.pause();
      return undefined;
    }

    // Browsers usually suspend background tabs, but not reliably for muted
    // autoplaying video — decoding a 4K loop nobody can see is pure waste.
    const onVisibility = () => {
      if (document.hidden) video.pause();
      else video.play().catch(() => {});
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (unavailable) return null;

  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster}
      // muted + playsInline are what make autoplay legal on mobile Safari and
      // Chrome; without both, the clip silently never starts.
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden="true"
      onError={() => setUnavailable(true)}
      className="pointer-events-none fixed inset-0 z-0 h-full w-full object-cover"
      style={{ opacity, mixBlendMode: blend }}
    />
  );
}
