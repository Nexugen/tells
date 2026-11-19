// Builds the Chrome extension into extension/build (load it unpacked from there) and zips it into
// extension/dist for the Chrome Web Store. `node extension/build.mjs --test` also matches 127.0.0.1
// and localhost, for the load test only; never upload a --test build.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const test = process.argv.includes('--test');
const out = join(here, test ? 'build-test' : 'build');
const { version } = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));

export const SITES = [
  'https://mail.google.com/*',
  'https://www.linkedin.com/*',
  'https://x.com/*',
  'https://twitter.com/*',
  'https://app.slack.com/*',
  'https://www.notion.so/*',
];

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'icons'), { recursive: true });
await build({
  entryPoints: { content: join(here, 'src/content.ts'), popup: join(here, 'src/popup.ts') },
  outdir: out,
  bundle: true,
  format: 'iife',
  target: 'chrome110',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
});
for (const f of ['popup.html', 'popup.css']) cpSync(join(here, 'static', f), join(out, f));
for (const s of [16, 32, 48, 128]) cpSync(join(here, '..', 'public', 'icons', `icon-${s}.png`), join(out, 'icons', `icon-${s}.png`));
const icons = { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' };
const manifest = {
  manifest_version: 3,
  name: 'tells: does it sound like AI?',
  short_name: 'tells',
  version,
  description: 'Underlines the phrases that make your writing sound like AI as you type. Checking happens on your computer.',
  homepage_url: 'https://tells.nexugen.app',
  icons,
  action: { default_popup: 'popup.html', default_title: 'tells', default_icon: icons },
  permissions: ['storage', 'activeTab', 'scripting'],
  host_permissions: ['https://tells.nexugen.app/*'],
  content_scripts: [{ matches: test ? [...SITES, 'http://127.0.0.1/*', 'http://localhost/*'] : SITES, js: ['content.js'], run_at: 'document_idle' }],
};
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
if (!test) {
  mkdirSync(join(here, 'dist'), { recursive: true });
  const zip = join(here, 'dist', `tells-chrome-${version}.zip`);
  rmSync(zip, { force: true });
  execFileSync('python3', ['-c', 'import os,sys,zipfile\nsrc,dst=sys.argv[1],sys.argv[2]\nz=zipfile.ZipFile(dst,"w",zipfile.ZIP_DEFLATED)\nfor d,_,fs in os.walk(src):\n  for f in sorted(fs):\n    p=os.path.join(d,f); z.write(p,os.path.relpath(p,src))\nz.close()', out, zip]);
  console.log(`built ${out} and ${zip}`);
} else console.log(`built ${out} (test build, not for the store)`);
