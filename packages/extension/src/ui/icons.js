/**
 * A small, consistent icon set: 16×16, 1.5px stroke, no fills, currentColor.
 *
 * Hand-drawn rather than pulled from a library so every glyph shares the same
 * weight and terminal style — mismatched stroke widths across an icon set is one
 * of the fastest ways to make an interface look assembled instead of designed.
 * Emoji are deliberately not used anywhere in the chrome.
 */

const svg = (paths, extra = '') =>
  `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor"
        stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
        aria-hidden="true" ${extra}>${paths}</svg>`;

export const icons = {
  refresh: svg('<path d="M13.6 8a5.6 5.6 0 1 1-1.7-4"/><path d="M13.5 2.4V6H10"/>'),

  // Sliders, not a gear — fewer curves at 15px, and it reads as "adjust".
  sliders: svg('<path d="M2.5 5.5h11M2.5 10.5h11"/><circle cx="6" cy="5.5" r="1.9"/><circle cx="10" cy="10.5" r="1.9"/>'),

  pause: svg('<path d="M6 3.5v9M10 3.5v9"/>'),
  play: svg('<path d="M5.5 3.6 12 8l-6.5 4.4z"/>'),
  trash: svg('<path d="M2.8 4.4h10.4M6.4 4.4V2.9h3.2v1.5"/><path d="M4.6 4.4 5.2 13h5.6l.6-8.6"/>'),
  download: svg('<path d="M8 2.4v7.4M4.8 6.9 8 10.1l3.2-3.2"/><path d="M2.8 13.2h10.4"/>'),
  upload: svg('<path d="M8 10.1V2.7M4.8 5.9 8 2.7l3.2 3.2"/><path d="M2.8 13.2h10.4"/>'),
  check: svg('<path d="M3.2 8.4 6.3 11.5l6.5-7"/>'),
  close: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
  external: svg('<path d="M9.4 3h3.6v3.6"/><path d="M13 3 7.6 8.4"/><path d="M11.4 9.6v3.4H3V4.6h3.4"/>'),
  bell: svg('<path d="M4 11a4 4 0 0 0 8 0V7a4 4 0 0 0-8 0v4z"/><path d="M2.5 11h11"/><path d="M6.5 13.5a1.5 1.5 0 0 0 3 0"/>'),
};

/** The wordmark glyph: an iris. Sized by the caller via CSS. */
export const eyeMark = `
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="6.4" stroke="currentColor" stroke-width="1.6"/>
    <circle cx="8" cy="8" r="2.4" fill="currentColor"/>
  </svg>
`;
