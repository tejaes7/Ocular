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

  $('wordmark').insertAdjacentHTML('afterbegin', eyeMark);
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
  $('device-id').textContent = await getDeviceId();

  syncNestedState();
  await loadDiagnostics();
}

function syncNestedState() {
  fields.tabIdle.disabled = !fields.tabChecks.checked;
  fields.backupDays.disabled = !fields.autoBackup.checked;
  fields.syncEndpoint.disabled = !fields.syncEnabled.checked;
}

fields.tabChecks.addEventListener('change', syncNestedState);
fields.autoBackup.addEventListener('change', syncNestedState);
fields.syncEnabled.addEventListener('change', syncNestedState);

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
    sync: {
      enabled: fields.syncEnabled.checked,
      endpoint: fields.syncEndpoint.value.trim().replace(/\/$/, ''),
    },
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
    sync: {
      enabled: fields.syncEnabled.checked,
      endpoint: fields.syncEndpoint.value.trim().replace(/\/$/, ''),
    },
  });
  await send({ type: 'settingsChanged' });

  const result = await send({ type: 'syncNow' });
  button.disabled = false;

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
