/**
 * Talking to the Ocular extension from the website.
 *
 * A page cannot call `chrome.runtime.sendMessage` at an unpacked extension
 * without knowing its id, and an unpacked id is derived from the folder path —
 * so it differs on every machine and cannot be hardcoded here. Instead the
 * extension is expected to run a small content script on this origin which:
 *
 *   1. marks its presence by setting `data-ocular` on <html>, and
 *   2. relays `window.postMessage` traffic through to its background worker.
 *
 * That keeps the id out of this file entirely and works identically for an
 * unpacked build and a Web Store install.
 *
 * If the extension is absent, every function here fails quietly and quickly —
 * the caller's job is then to point the visitor at the install button, not to
 * show an error.
 */

const MARKER = 'ocular';
const CHANNEL = 'ocular-web';

/** How long to wait for the relay to answer before treating it as absent. */
const REPLY_TIMEOUT_MS = 1200;

/**
 * The content script runs at document_idle, so on a cold load the marker can
 * arrive slightly after React has mounted. Poll briefly rather than deciding
 * "not installed" on the first frame and shaking the button at someone who has
 * it installed.
 */
export async function detectExtension({ timeoutMs = 800 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const version = document.documentElement.dataset[MARKER];
    if (version) return { installed: true, version };
    await new Promise((resolve) => setTimeout(resolve, 60));
  }

  return { installed: false, version: null };
}

/**
 * Ask the extension to start watching a product URL.
 *
 * Resolves with whatever the extension reports. Rejects only if it never
 * answers, which is treated the same as not installed.
 */
export function trackViaExtension(url) {
  return new Promise((resolve, reject) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const onReply = (event) => {
      // Only trust messages this window sent to itself: a postMessage from an
      // iframe or another origin must never be able to answer for the extension.
      if (event.source !== window) return;
      const data = event.data;
      if (data?.channel !== CHANNEL || data?.direction !== 'from-extension') return;
      if (data.requestId !== requestId) return;

      cleanup();
      resolve(data.result || { ok: false });
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('The Ocular extension did not respond.'));
    }, REPLY_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener('message', onReply);
    }

    window.addEventListener('message', onReply);
    window.postMessage({ channel: CHANNEL, direction: 'to-extension', type: 'track', url, requestId }, window.location.origin);
  });
}

/**
 * Ask the install call-to-action to draw attention to itself.
 *
 * A custom event rather than lifted state: the button lives in the navbar and
 * the form that needs it lives in the hero, and threading a prop between them
 * through App would couple two unrelated components for one animation.
 */
export const NUDGE_INSTALL_EVENT = 'ocular:nudge-install';

export function nudgeInstall() {
  window.dispatchEvent(new CustomEvent(NUDGE_INSTALL_EVENT));
}
