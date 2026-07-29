/**
 * Build: packages/extension/src/ -> <repo root>/extension/
 *
 * Why bundle at all: declared content scripts cannot be ES modules, so the old
 * code reached for `import(chrome.runtime.getURL(...))`. That is evaluated
 * against the *page's* CSP on some Chrome versions, and every retailer we target
 * ships a strict CSP. Bundling removes the failure mode instead of hoping.
 *
 * ---------------------------------------------------------------------------
 * DO NOT CHANGE THE OUTPUT PATH.
 *
 * Chrome derives an unpacked extension's ID from its folder path, and
 * chrome.storage.local is keyed to that ID. Moving the build output means every
 * existing user loads a "new" extension and silently loses every tracked
 * product and their entire price history.
 *
 * That is why the loadable build sits at the repository root as `extension/`
 * rather than inside this package as `dist/`. It looks unusual in a monorepo;
 * it is deliberate. If it ever must move, ship an export/import migration
 * first — see packages/extension/src/lib/backup.js.
 * ---------------------------------------------------------------------------
 */

import esbuild from 'esbuild';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

const SRC = path.join(HERE, 'src');
// See the header comment before touching this.
const OUT = path.join(REPO_ROOT, 'extension');

const watch = process.argv.includes('--watch');
const prod = process.argv.includes('--prod');
const zip = process.argv.includes('--zip');

const JS_ENTRIES = [
  'background.js',
  'content.js',
  'popup.js',
  'options.js',
  'offscreen.js',
  'onboarding.js',
];

const CSS_ENTRIES = ['content.css', 'popup.css', 'options.css', 'onboarding.css'];

const STATIC_FILES = ['manifest.json', 'popup.html', 'options.html', 'offscreen.html', 'onboarding.html'];

const present = (file) => existsSync(path.join(SRC, file));

// ---------------------------------------------------------------------------

/**
 * Empty the output folder without removing the folder itself — Chrome holds a
 * handle on a loaded unpacked extension's directory, so `rm -r` on it fails.
 */
async function cleanOutput() {
  await mkdir(OUT, { recursive: true });
  for (const entry of await readdir(OUT)) {
    await rm(path.join(OUT, entry), { recursive: true, force: true }).catch((error) => {
      console.warn(`  ! could not remove ${entry}: ${error.code}`);
    });
  }
}

async function copyStatic() {
  const version = JSON.parse(await readFile(path.join(HERE, 'package.json'), 'utf8')).version;

  for (const file of STATIC_FILES.filter(present)) {
    if (file === 'manifest.json') {
      // Single source of truth for the version number: package.json.
      const manifest = JSON.parse(await readFile(path.join(SRC, file), 'utf8'));
      manifest.version = version;
      await writeFile(path.join(OUT, file), `${JSON.stringify(manifest, null, 2)}\n`);
    } else {
      await cp(path.join(SRC, file), path.join(OUT, file));
    }
  }

  if (existsSync(path.join(SRC, 'icons'))) {
    await cp(path.join(SRC, 'icons'), path.join(OUT, 'icons'), { recursive: true });
  }

  return version;
}

function buildOptions() {
  return {
    entryPoints: [
      ...JS_ENTRIES.filter(present).map((f) => path.join(SRC, f)),
      ...CSS_ENTRIES.filter(present).map((f) => path.join(SRC, f)),
    ],
    outdir: OUT,
    bundle: true,
    // IIFE, not ESM: content scripts must be classic scripts, and keeping every
    // entry point on the same format removes a whole class of surprise.
    format: 'iife',
    target: ['chrome116'],
    platform: 'browser',
    minify: prod,
    sourcemap: prod ? false : 'inline',
    logLevel: 'warning',
    legalComments: 'none',
    define: { __OCULAR_DEV__: String(!prod) },
  };
}

// ---------------------------------------------------------------------------
// Manifest validation — a missing file should fail the build, not fail silently
// at 2am inside Chrome.
// ---------------------------------------------------------------------------

function manifestReferences(manifest) {
  const refs = new Set();
  const add = (value) => {
    if (typeof value === 'string' && !value.includes('*')) refs.add(value);
  };

  add(manifest.background?.service_worker);
  add(manifest.options_page);
  add(manifest.action?.default_popup);
  Object.values(manifest.action?.default_icon || {}).forEach(add);
  Object.values(manifest.icons || {}).forEach(add);

  for (const script of manifest.content_scripts || []) {
    (script.js || []).forEach(add);
    (script.css || []).forEach(add);
  }
  for (const entry of manifest.web_accessible_resources || []) {
    (entry.resources || []).forEach(add);
  }

  return [...refs];
}

async function validate() {
  const manifest = JSON.parse(await readFile(path.join(OUT, 'manifest.json'), 'utf8'));
  const missing = manifestReferences(manifest).filter(
    (ref) => !existsSync(path.join(OUT, ref))
  );

  if (missing.length) {
    throw new Error(
      `manifest.json references files that were not produced:\n  - ${missing.join('\n  - ')}`
    );
  }

  // HTML files must not point at anything that vanished either.
  for (const file of STATIC_FILES.filter((f) => f.endsWith('.html') && present(f))) {
    const html = await readFile(path.join(OUT, file), 'utf8');
    for (const [, ref] of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) {
      if (!existsSync(path.join(OUT, ref))) {
        throw new Error(`${file} references missing file: ${ref}`);
      }
      if (/<script[^>]+type="module"/.test(html)) {
        throw new Error(`${file} uses <script type="module">, but the build emits IIFE bundles.`);
      }
    }
  }

  return manifest;
}

async function makeZip(version) {
  const name = path.join(REPO_ROOT, `ocular-${version}.zip`);
  await rm(name, { force: true });

  const run = promisify(execFile);
  if (process.platform === 'win32') {
    await run('powershell', [
      '-NoProfile', '-Command',
      `Compress-Archive -Path '${OUT}/*' -DestinationPath '${name}' -Force`,
    ]);
  } else {
    // `name` is absolute, so no `../` prefix — that would escape the repo.
    await run('zip', ['-r', '-q', name, '.'], { cwd: OUT });
  }
  console.log(`  packaged ${path.relative(REPO_ROOT, name)}`);
}

// ---------------------------------------------------------------------------

async function main() {
  const started = Date.now();
  await cleanOutput();
  const version = await copyStatic();

  if (watch) {
    const context = await esbuild.context(buildOptions());
    await context.rebuild();
    await validate();
    await context.watch();
    console.log(`Ocular ${version} — watching src/, output in ${path.relative(REPO_ROOT, OUT)}/`);
    console.log('Reload the extension in chrome://extensions after each change.');
    return;
  }

  await esbuild.build(buildOptions());
  const manifest = await validate();

  console.log(`Ocular ${version} built to ${path.relative(REPO_ROOT, OUT)}/ in ${Date.now() - started}ms`);
  console.log(`  ${manifest.content_scripts?.[0]?.matches.length ?? 0} matched hosts`);

  if (zip) await makeZip(version);
}

main().catch((error) => {
  console.error(`\nBuild failed: ${error.message}\n`);
  process.exit(1);
});
