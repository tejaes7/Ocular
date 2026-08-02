import { restoreBackup } from './lib/backup.js';
import { relativeTime } from '@ocular/shared/format';
import { getDeviceId, getSettings, saveSettings } from './lib/store.js';
import { eyeMark } from './ui/icons.js';

const $ = (id) => document.getElementById(id);

const fields = {
  interval: $('interval'),
  maxChecks: $('max-checks'),
  tabChecks: $('tab-checks'),
  tabIdle: $('tab-idle'),
  notifyAny: $('notify-any'),
  minDrop: $('min-drop'),
  autoBackup: $('auto-backup'),
  backupDays: $('backup-days'),
  syncEnabled: $('sync-enabled'),
  syncEndpoint: $('sync-endpoint'),
  siteUrl: $('sync-site'),
};

const send = async (message) => {
  try {
    return (await chrome.runtime.sendMessage(message)) ?? { ok: false, error: 'No response' };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
};

function setStatus(el, text, tone = '') {
  el.textContent = text;
  el.className = `status${tone ? ` status--${tone}` : ''}`;
}

// ---------------------------------------------------------------------------
// Load / save
// ---------------------------------------------------------------------------

async function load() {
  const settings = await getSettings();

  fields.interval.value = String(settings.checkIntervalMinutes);
  fields.maxChecks.value = settings.maxChecksPerSweep;
  fields.tabChecks.checked = settings.tabChecks !== false;
  fields.tabIdle.checked = settings.tabChecksOnlyWhenIdle !== false;
  fields.notifyAny.checked = settings.notifyOnAnyDrop;
  fields.minDrop.value = settings.minDropPercentToNotify;
  fields.autoBackup.checked = settings.autoBackup !== false;
  fields.backupDays.value = settings.backupIntervalDays;
  fields.syncEnabled.checked = Boolean(settings.sync?.enabled);
  fields.syncEndpoint.value = settings.sync?.endpoint || '';
  fields.siteUrl.value = settings.sync?.siteUrl || '';

  $('wordmark').insertAdjacentHTML('afterbegin', eyeMark);
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
  $('device-id').textContent = await getDeviceId();

  syncNestedState();
  renderEmailAlerts(settings);
  await loadDiagnostics();
}

// ---------------------------------------------------------------------------
// Email alerts
// ---------------------------------------------------------------------------

/**
 * The state shown here is the server's, cached at the last sync — a device can
 * be unlinked from the website, and a locally remembered "on" would then be a
 * lie. The device-id hint changes with it, because "anonymous, not linked to
 * any account" stops being true the moment this is on.
 */
function renderEmailAlerts(settings) {
  const linked = Boolean(settings.sync?.linked);
  const configured = Boolean(settings.sync?.enabled && settings.sync?.endpoint);
  const hasSite = Boolean(settings.sync?.siteUrl);

  $('email-alerts-state').textContent = linked ? 'Email alerts are on' : 'Email alerts are off';
  $('email-alerts-toggle').textContent = linked ? 'Turn off' : 'Turn on…';
  $('email-alerts-toggle').disabled = !configured || (!hasSite && !linked);

  $('device-id-hint').textContent = linked
    ? 'Generated locally. Currently linked to your account for email alerts.'
    : 'Generated locally. Anonymous, not linked to any account.';

  const hint = $('email-alerts-hint');
  if (!configured) {
    hint.textContent = 'Turn on background sync first — alerts are sent by the server.';
  } else if (!hasSite && !linked) {
    hint.textContent = 'No Ocular site is configured for this build, so there is nowhere to sign in.';
  } else if (linked) {
    hint.textContent = 'Turning this off unlinks this browser and stops the emails.';
  } else {
    hint.textContent = 'Opens the Ocular site so you can sign in and confirm.';
  }
}

$('email-alerts-toggle').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const status = $('email-alerts-status');
  const settings = await getSettings();

  if (settings.sync?.linked) {
    button.disabled = true;
    setStatus(status, 'Turning off…');

    const result = await send({ type: 'unlinkEmailAlerts' });
    button.disabled = false;

    if (result.ok) {
      setStatus(status, 'Email alerts are off. This browser is no longer linked.', 'good');
      renderEmailAlerts(await getSettings());
    } else {
      setStatus(status, `Could not turn off: ${result.error}`, 'bad');
    }
    return;
  }

  // Linking needs a Firebase token the extension does not have, so the website
  // finishes it. The state here updates on the next sync, not on tab close —
  // the server is what actually knows whether it worked.
  const result = await send({ type: 'pairUrl' });
  if (!result.ok || !result.url) {
    setStatus(status, result.error || 'No Ocular site is configured.', 'bad');
    return;
  }

  chrome.tabs.create({ url: result.url });
  setStatus(status, 'Finish signing in on the Ocular site, then press “Sync now”.');
});

function syncNestedState() {
  fields.tabIdle.disabled = !fields.tabChecks.checked;
  fields.backupDays.disabled = !fields.autoBackup.checked;
  fields.syncEndpoint.disabled = !fields.syncEnabled.checked;
  fields.siteUrl.disabled = !fields.syncEnabled.checked;
}

fields.tabChecks.addEventListener('change', syncNestedState);
fields.autoBackup.addEventListener('change', syncNestedState);
fields.syncEnabled.addEventListener('change', syncNestedState);

/**
 * Build the `sync` object from the form, preserving what the form does not own.
 *
 * saveSettings replaces `sync` wholesale, so rebuilding it from the three inputs
 * would drop `linked` — the cached link state — on every press of Save, and the
 * email alerts row would flip back to "off" until the next sync corrected it.
 */
async function syncSettingsFromForm() {
  const stored = (await getSettings()).sync;
  return {
    ...stored,
    enabled: fields.syncEnabled.checked,
    endpoint: fields.syncEndpoint.value.trim().replace(/\/$/, ''),
    siteUrl: fields.siteUrl.value.trim().replace(/\/$/, ''),
  };
}

$('save').addEventListener('click', async () => {
  await saveSettings({
    checkIntervalMinutes: Number(fields.interval.value),
    maxChecksPerSweep: Math.max(1, Number(fields.maxChecks.value) || 25),
    tabChecks: fields.tabChecks.checked,
    tabChecksOnlyWhenIdle: fields.tabIdle.checked,
    notifyOnAnyDrop: fields.notifyAny.checked,
    minDropPercentToNotify: Number(fields.minDrop.value) || 0,
    autoBackup: fields.autoBackup.checked,
    backupIntervalDays: Math.max(1, Number(fields.backupDays.value) || 7),
    sync: await syncSettingsFromForm(),
  });

  // The alarm period lives in the service worker; ask it to reschedule.
  await send({ type: 'settingsChanged' });

  setStatus($('saved'), 'Saved', 'good');
  setTimeout(() => setStatus($('saved'), ''), 1800);
  await loadDiagnostics();
});

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

$('export').addEventListener('click', async () => {
  const status = $('backup-status');
  setStatus(status, 'Preparing…');

  const result = await send({ type: 'exportBackup' });
  if (result.ok) {
    setStatus(status, `Exported ${result.products} product(s) with full price history.`, 'good');
  } else {
    setStatus(status, `Export failed: ${result.error}`, 'bad');
  }
});

$('import').addEventListener('click', () => $('import-file').click());

$('import-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = ''; // allow re-picking the same file
  if (!file) return;

  const status = $('backup-status');
  setStatus(status, `Reading ${file.name}…`);

  try {
    const data = JSON.parse(await file.text());
    // Merge, never replace: restoring an old backup must not delete products
    // added since, nor truncate histories that have grown.
    const result = await restoreBackup(data, { includeSettings: false });

    setStatus(
      status,
      `Imported. ${result.added} new product(s), ${result.merged} merged, ` +
        `${result.pointsAdded} new price reading(s).`,
      'good'
    );

    await send({ type: 'settingsChanged' });
    await loadDiagnostics();
  } catch (error) {
    setStatus(status, `Import failed:\n${error.message}`, 'bad');
  }
});

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

$('sync-now').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const status = $('sync-status');

  button.disabled = true;
  setStatus(status, 'Contacting the worker…');

  // Persist first: syncing against an endpoint the user typed but hasn't saved
  // would silently do nothing.
  await saveSettings({
    sync: await syncSettingsFromForm(),
  });
  await send({ type: 'settingsChanged' });

  const result = await send({ type: 'syncNow' });
  button.disabled = false;

  // A sync is what refreshes the link state, so this is the moment the email
  // alerts row can stop being stale — including after pairing on the website.
  renderEmailAlerts(await getSettings());

  if (result.ok) {
    setStatus(
      status,
      `Synced. Server is watching ${result.tracking ?? 0} product(s); ` +
        `${result.pulled ?? 0} new reading(s) pulled in.`,
      'good'
    );
  } else {
    setStatus(status, `Sync failed: ${result.error}`, 'bad');
  }
});

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

async function loadDiagnostics() {
  const el = $('diagnostics');
  const result = await send({ type: 'diagnostics' });

  if (!result.ok) {
    el.textContent = `Background worker unreachable: ${result.error}`;
    return;
  }

  const hosts = Object.entries(result.hosts || {});
  const describe = ([host, state]) => {
    if (state.blockedUntil > Date.now()) {
      return `<b>${host}</b> — blocked, retrying ${relativeTime(state.blockedUntil).replace(' ago', ' from now')}`;
    }
    if (state.strategy === 'tab') return `<b>${host}</b> — using hidden tab`;
    if (state.strategy === 'fetch') return `<b>${host}</b> — direct fetch works`;
    return `<b>${host}</b> — not checked yet`;
  };

  el.innerHTML = [
    `Version <b>${result.version}</b>`,
    `Tracking <b>${result.products}</b> product(s)${result.errors ? `, <b>${result.errors}</b> with errors` : ''}`,
    `Last backup: <b>${result.lastBackupAt ? relativeTime(result.lastBackupAt) : 'never'}</b>`,
    hosts.length ? '' : 'No sites checked yet.',
    ...hosts.map(describe),
  ]
    .filter(Boolean)
    .join('<br />');
}

load();
