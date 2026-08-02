import React from 'react';

/**
 * Social marks, inlined.
 *
 * lucide-react 1.x removed its brand icons (Facebook/Instagram/Twitter no longer
 * export), and its `X` is the close glyph, not the company. These are drawn in
 * lucide's line style — 24px box, currentColor, 1.8 stroke — so they sit
 * consistently next to the other icons in the footer.
 */

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export function FacebookIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M17 2h-3a5 5 0 0 0-5 5v3H6v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

export function InstagramIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="2" y="2" width="20" height="20" rx="5.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.6" cy="6.4" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** The X wordmark only reads as a solid shape at this size, so it is filled. */
export function XIcon(props) {
  return (
    <svg {...base} strokeWidth={0} fill="currentColor" {...props}>
      <path d="M17.53 3h2.97l-6.49 7.41L21.75 21h-5.98l-4.68-6.13L5.7 21H2.73l6.94-7.93L2.25 3h6.13l4.23 5.6L17.53 3zm-1.04 16.2h1.64L7.6 4.71H5.83L16.49 19.2z" />
    </svg>
  );
}
