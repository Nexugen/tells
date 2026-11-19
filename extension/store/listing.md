# Chrome Web Store listing: tells

Paste these into the Chrome Web Store developer dashboard. Upload `extension/dist/tells-chrome-<version>.zip`, built with `npm run build:extension`.

## Name

tells: does it sound like AI?

## Summary (132 characters at most)

Underlines the phrases that make your writing sound like AI as you type. Checking happens on your computer.

## Category

Tools (or Productivity: Communication)

## Description

tells marks the phrases that make writing read like a chatbot wrote it, while you type. Hover over a marked phrase to see why it stands out and what to write instead.

It works in Gmail, LinkedIn, X, Slack and Notion. On other sites, open tells from the toolbar and choose "Underline on this page too".

The popup has a paste box for anything else. Press Fix to rewrite only the marked sentences, or Sound like me to rewrite a draft in your own style, learned from a few things you wrote.

Your writing stays on your computer. The check runs inside your browser with no network. Text leaves the page only when you press Fix, Sound like me or Learn my style, and then it goes to tells.nexugen.app to be rewritten. Nothing is kept there.

tells was tested on about 14,500 texts written by people, so it tries hard not to mark ordinary human writing. A marked phrase is a reason to read the sentence again. It is not proof that AI wrote it, so please do not use it to accuse anyone.

Google Docs is not supported: it draws its text on a canvas, so no extension can underline inside it. Paste the text into the popup instead.

tells is free and open source: https://github.com/Nexugen/tells

## Single purpose (privacy tab)

Shows which phrases in the text the user is writing read as AI-written, and rewrites them when the user asks.

## Permission justifications (privacy tab)

- storage: keeps the user's settings, a free key for the rewrite service and the user's style profile, in the browser only.
- activeTab and scripting: when the user presses "Underline on this page too" in the popup, tells runs on that one tab. Without this it runs only on Gmail, LinkedIn, X, Slack and Notion.
- Host permission for tells.nexugen.app: sends text for a rewrite when the user presses Fix, Sound like me or Learn my style.
- Content scripts on mail.google.com, www.linkedin.com, x.com, twitter.com, app.slack.com and www.notion.so: underline phrases in the text box the user is typing in. The text is checked inside the browser and is not sent anywhere.

## Data use (privacy tab)

- Collects website content: only the text the user chooses to send with Fix, Sound like me or Learn my style. It is used to make the rewrite and is not stored.
- No personally identifiable information, health, financial, authentication, location, web history or user activity data is collected.
- Data is not sold, not used for anything unrelated to the single purpose, and not used to work out creditworthiness.

Privacy policy URL: https://tells.nexugen.app/privacy

## Screenshots (1280 x 800)

1. `screenshot-1-underlines.png`: underlines in a rich text editor, with the explain card open.
2. `screenshot-2-explain.png`: underlines in a plain text box, with the explain card open.
3. `screenshot-3-popup.png`: the popup with a paste box and the habits found.

## Load it unpacked (to try before publishing)

1. Run `npm run build:extension` in the repository.
2. Open chrome://extensions and turn on Developer mode.
3. Choose "Load unpacked" and pick the `extension/build` folder.
