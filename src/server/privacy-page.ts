// /privacy: what the site, the API, the assistant connectors and the browser extension do with your text.
import { esc, pageHead, siteFooter, siteHeader } from './page.ts';

export const PRIVACY_PATH = '/privacy';
export const PRIVACY_UPDATED = '19 November 2026';

/** The policy as [heading, paragraphs]. Kept as data so the tests can check it with tells. */
export const PRIVACY: [string, string[]][] = [
  ['The short version', [
    'tells has no accounts, no ads, no tracking and no analytics. We do not sell or share anything about you. What you paste is used to answer your request and then dropped. It is not saved on our side.',
  ]],
  ['Checking your writing', [
    'On the website, pressing Check sends your text to our server at tells.nexugen.app. The server checks it in memory, sends back the result and keeps nothing. The same goes for the API and the connectors for Claude and ChatGPT.',
    'The command line tool, the library, the local connector and the browser extension check text on your own device. Nothing is sent anywhere for a check.',
  ]],
  ['Fix it and rewrite in my style', [
    'These are the only features that use an AI model. When you press one, your text goes to our server and from there to Claude, a model made by Anthropic, which writes the new version. Anthropic handles it under its own terms and privacy policy. We do not keep the text or the result.',
    'To learn your style, the things you paste are sent to our server, measured, and sent back to you as a style profile. We do not keep them. The profile is saved in your browser or in the extension, and you can delete it at any time with Forget my style. When you rewrite in your style, the profile goes along with your draft, and it contains a few short excerpts of what you pasted.',
  ]],
  ['What we do keep', [
    'To keep the free rewrites fair, the server counts how many each address and each free key used today. Addresses and keys are stored only as one-way hashes, never as plain text, together with the day\'s totals. The web server also keeps standard access logs (address, time, page requested) to deal with abuse. They do not contain the text you paste, unless you open a link that carries text in its address.',
  ]],
  ['On your device', [
    'The website saves a few things in your browser\'s local storage: a free key if you were given one, your style profile if you made one, and whether you closed the hint about adding tells to your phone. When you add tells to your home screen, the page itself is saved for offline start up. Clearing site data removes all of it.',
  ]],
  ['The browser extension', [
    'The extension underlines phrases in text boxes as you type. That check runs inside your browser with no network. No text leaves the page unless you press Fix, Sound like me or Learn my style in the extension, and then it goes to our server as described above.',
    'It runs on a short list of sites (Gmail, LinkedIn, X, Slack and Notion) and on other pages only when you turn it on for that page. It asks for storage, to keep your settings and style profile, and for access to tells.nexugen.app, to send a fix when you press the button. It never reads passwords or other fields you did not type prose into, and it has no analytics.',
  ]],
  ['Changes and contact', [
    'If this policy changes, the new version goes here with a new date. Questions go to hello@nexugen.app or to an issue on GitHub.',
  ]],
];

export function privacyCopy(): string {
  return PRIVACY.map(([h, ps]) => [h, ...ps].join('\n\n')).join('\n\n');
}

export function privacyPage(): string {
  return `${pageHead({ title: 'Privacy | tells', description: 'What tells does with your text on the website, the API, the assistant connectors and the browser extension. Short version: nothing is kept.', path: PRIVACY_PATH, name: 'tells privacy policy' })}
${siteHeader()}
<main class="use">
<h1>Privacy</h1>
<p class="muted">Last updated ${PRIVACY_UPDATED}. This covers the tells website, its API, the connectors for AI assistants and the tells browser extension.</p>
${PRIVACY.map(([h, ps]) => `<h2>${esc(h)}</h2>\n${ps.map((p) => `<p>${esc(p)}</p>`).join('\n')}`).join('\n\n')}

${siteFooter(false)}
</main>
</body>
</html>`;
}
