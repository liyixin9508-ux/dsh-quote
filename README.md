# dsh-quote

Quote whole replies or a text selection inside a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
conversation, without polluting the composer. Quotes wait in a light-gray bubble
above the input box and ride along with your next message.

This is a third-party plugin and is not affiliated with DeepSeek.

## Install

Requires a DeepSeek Harness with the client bundle system (`0.2.1-rc.5` is the
version this package was tested against).

```
# from a GitHub checkout (after this repository is pushed)
plugin_manager install_bundle github:liyixin9508-ux/dsh-quote

# from a local checkout
plugin_manager install_bundle /path/to/dsh-quote
```

Restart the app once after installing: the bundle's Host half loads on startup.
Upgrades that only touch `client.js` need a page refresh, not a restart.

## Use

- **Whole reply** — press **引用** in a finalized assistant answer's action row.
- **Selected text** — select text inside any chat message, right-click, then pick
  **引用**. The same menu still offers **复制** (copy).
- The quote waits in a gray bubble above the composer. It shows the quote source
  (助手 / 我) and the full text, scrolls when long, and **×** removes it.
- Type your follow-up and send as usual. The bubble disappears the moment the
  message goes out, and the model receives a Markdown blockquote at the top of
  your message:

```
> 引用 · 助手：
> …quoted text…
```

If the message never goes out (send failed), the quote is kept — unless you
removed it, or you sent a `/` command (commands don't carry the quote; it stays
pending for the next message).

## How it works

- The bubble is an entry in the `conversation.input.dock` slot (full-width area
  above the composer card). Pending quotes live in a per-session store persisted
  to `localStorage` under `dsh.quote.v1.<sessionId>`.
- The composer editor is never touched. The browser half patches the session
  composer's `submit` facade: on submit it prepends the blockquote to
  `shell.draftSnapshot` via `setDraft({ text, references })` (keeping `@file`
  chip offsets), clears the quote, and then calls the original submit.
- A session-event watcher clears the bubble when a new user message appears, as a
  fallback for send paths that bypass the patched submit.
- The app's right-click menu is owned by the Electron main process and cannot be
  extended; the browser half captures `contextmenu`, calls `preventDefault`, and
  renders its own two-item menu only for text selected inside
  `[data-conversation-region="chat"]`. Editable areas keep the native menu.

These are internal client interfaces with no public stability guarantee: the
bundle declares `engines.dsh`, but a DSH upgrade can still break behavior. Pin the
tested version, or test after upgrading.

## Known limitations

- One pending quote per conversation; quoting again replaces it.
- Whole-reply quoting sends the entire reply (no truncation) — select a range if
  you want a smaller quote.
- Sending a quote-only message works from the keyboard (Enter) but the send
  button stays disabled while the input box is empty.

## Development

```
node --check client.js     # syntax
npm pack --dry-run         # 6 files, no personal data
```

`client.js` is the whole feature; `index.js` is an empty Host half so the bundle
has an entry.

## License

MIT © liyixin9508-ux
