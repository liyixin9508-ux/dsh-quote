/**
 * dsh-quote — browser half.
 *
 * Quote earlier conversation content without dirtying the composer:
 *
 *   - the 引用 action on a finalized assistant message quotes the whole reply;
 *   - a text selection inside a chat message gets 复制 / 引用 on right-click.
 *
 * The pending quote waits in a light-gray bubble above the composer (the
 * `conversation.input.dock` slot). The editor stays empty: the blockquote is
 * folded into the draft only inside the patched `shell.submit`, right before
 * the message is sent, so what you quote is what the model receives.
 *
 * `dsh-quote` is a UI-only bundle: the host half is a no-op; everything here is
 * discovered through package.json `dsh.client`.
 */
window.__ModuleLoader__.load({
  id: 'dsh-quote',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const DICT = {
      zh: {
        quote: '引用', quoteFailed: '引用失败', assistant: '助手', user: '我',
        quoteRemove: '移除引用', quoteSendHint: '发送时随消息一起发出',
        quoteMenuCopy: '复制', quoteMenuQuote: '引用',
      },
      en: {
        quote: 'Quote', quoteFailed: 'Quote failed', assistant: 'Assistant', user: 'You',
        quoteRemove: 'Remove quote', quoteSendHint: 'sent together with your message',
        quoteMenuCopy: 'Copy', quoteMenuQuote: 'Quote',
      },
    };

    const S = {
      quoteBtn: { height: 22, padding: '0 6px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', font: 'inherit', fontSize: 10.5, cursor: 'pointer' },
      quoteDock: { boxSizing: 'border-box', width: 'calc(100% - 2 * var(--dsh-composer-side-clearance, 0px) - 2 * var(--dsh-composer-dock-inset, 0px))', maxWidth: 'calc(var(--dsh-composer-card-max-width, 720px) - 2 * var(--dsh-composer-dock-inset, 0px))', margin: '0 auto 4px', padding: '0 var(--dsh-composer-dock-inset, 0px)', flex: 'none' },
      quoteBubble: { boxSizing: 'border-box', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 10, background: 'color-mix(in srgb, var(--dsw-alias-label-primary) 6%, var(--dsw-alias-bg-base))', padding: '6px 9px', display: 'flex', flexDirection: 'column', gap: 3 },
      quoteHead: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 },
      quoteLabel: { fontSize: 10.5, fontWeight: 600, color: 'var(--dsw-alias-label-primary)', flex: '0 0 auto' },
      quoteHint: { fontSize: 9.5, color: 'var(--dsw-alias-label-secondary)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      quoteClose: { flex: '0 0 auto', height: 20, padding: '0 7px', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 6, background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-secondary)', font: 'inherit', fontSize: 12, lineHeight: '18px', cursor: 'pointer' },
      quoteText: { fontSize: 11.5, lineHeight: 1.55, color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 132, overflowY: 'auto', paddingRight: 2 },
      menu: { position: 'fixed', zIndex: 2147483000, minWidth: 92, padding: 3, borderRadius: 7, background: 'var(--dsw-alias-bg-overlay)', border: '1px solid var(--dsw-alias-border-l1)', boxShadow: '0 6px 18px rgba(0, 0, 0, 0.16)', display: 'flex', flexDirection: 'column', gap: 0 },
      menuItem: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 24, padding: '0 8px', border: 'none', borderRadius: 5, background: 'transparent', color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 11, lineHeight: '24px', textAlign: 'left', cursor: 'pointer' },
    };

    /*
     * Pending quote per session. It never touches the editor: the bubble renders
     * from this store and the text is folded into the draft only on submit.
     * localStorage keeps the bubble across reloads, like the draft itself.
     */
    const QUOTE_PREFIX = 'dsh.quote.v1.';
    const quoteCache = new Map();
    const quoteListeners = new Map();

    function quoteKey(sessionId) {
      return QUOTE_PREFIX + String(sessionId);
    }

    function quoteOf(sessionId) {
      const key = quoteKey(sessionId);
      if (!quoteCache.has(key)) {
        let value = null;
        try {
          const raw = window.localStorage.getItem(key);
          const parsed = raw ? JSON.parse(raw) : null;
          if (parsed && typeof parsed.text === 'string' && parsed.text !== '') {
            value = { text: parsed.text, role: parsed.role === 'user' ? 'user' : 'assistant' };
          }
        } catch (e) {}
        quoteCache.set(key, value);
      }
      return quoteCache.get(key);
    }

    function setQuote(sessionId, value) {
      quoteCache.set(quoteKey(sessionId), value);
      try {
        if (value) window.localStorage.setItem(quoteKey(sessionId), JSON.stringify({ text: value.text, role: value.role }));
        else window.localStorage.removeItem(quoteKey(sessionId));
      } catch (e) {}
      const listeners = quoteListeners.get(String(sessionId));
      if (listeners) for (const listener of listeners) { try { listener(); } catch (e) {} }
    }

    function subscribeQuote(sessionId, listener) {
      const key = String(sessionId);
      let listeners = quoteListeners.get(key);
      if (!listeners) { listeners = new Set(); quoteListeners.set(key, listeners); }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) quoteListeners.delete(key);
      };
    }

    /** Render one quote as the blockquote the model receives. */
    function quoteBlockText(t, quote) {
      const body = String(quote.text).split('\n').map((line) => '> ' + line).join('\n');
      return '> ' + t('quote') + ' · ' + t(quote.role) + '：\n' + body;
    }

    /** Light-gray bubble above the composer: the quote rides along when the message is sent. */
    function QuoteDock({ quote, t }) {
      const [current, setCurrent] = React.useState(() => quote.get());
      React.useEffect(() => {
        setCurrent(quote.get());
        return quote.subscribe(() => setCurrent(quote.get()));
      }, [quote]);
      if (!current) return null;
      return h('div', { style: S.quoteDock, 'data-dsh-quote-bubble': '' },
        h('div', { style: S.quoteBubble },
          h('div', { style: S.quoteHead },
            h('span', { style: S.quoteLabel }, t('quote') + ' · ' + t(current.role)),
            h('span', { style: S.quoteHint }, t('quoteSendHint')),
            h('button', {
              type: 'button', title: t('quoteRemove'), 'aria-label': t('quoteRemove'),
              onClick: (event) => { event.stopPropagation(); quote.remove(); },
              onMouseEnter: (event) => { event.currentTarget.style.background = 'var(--dsw-alias-bg-layer-1)'; },
              onMouseLeave: (event) => { event.currentTarget.style.background = 'var(--dsw-alias-bg-base)'; },
              style: S.quoteClose,
            }, '×')),
          h('div', { style: S.quoteText }, current.text)));
    }

    /*
     * Right-click menu for a text selection inside the transcript: 复制 / 引用.
     * The app's own menu is Electron-main owned and cannot gain items, so the
     * renderer replaces it locally (capture + preventDefault) for chat text only.
     */
    function installQuoteMenu({ t, onQuote }) {
      let menu = null;
      let detach = null;

      const fallbackCopy = (text) => {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.left = '-9999px';
        area.style.top = '0';
        document.body.appendChild(area);
        try { area.select(); document.execCommand('copy'); } catch (e) {}
        area.remove();
      };

      const copyText = (text) => {
        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
            return;
          }
        } catch (e) {}
        fallbackCopy(text);
      };

      const closeMenu = () => {
        if (detach) { detach(); detach = null; }
        if (menu) { menu.remove(); menu = null; }
      };

      const openMenu = (x, y, payload) => {
        closeMenu();
        const root = document.createElement('div');
        root.setAttribute('role', 'menu');
        root.setAttribute('data-dsh-quote-menu', '');
        Object.assign(root.style, S.menu);
        root.addEventListener('mousedown', (event) => event.preventDefault());
        const addItem = (label, run) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.setAttribute('role', 'menuitem');
          item.textContent = label;
          Object.assign(item.style, S.menuItem);
          item.addEventListener('mouseenter', () => { item.style.background = 'var(--dsw-alias-bg-layer-2)'; });
          item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
          item.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            closeMenu();
            run();
          });
          root.appendChild(item);
        };
        addItem(t('quoteMenuCopy'), () => copyText(payload.text));
        addItem(t('quoteMenuQuote'), () => onQuote(payload));
        document.body.appendChild(root);
        const rect = root.getBoundingClientRect();
        root.style.left = Math.max(6, Math.min(x, window.innerWidth - rect.width - 6)) + 'px';
        root.style.top = Math.max(6, Math.min(y, window.innerHeight - rect.height - 6)) + 'px';
        menu = root;
        const onPointerDown = (event) => { if (menu && !menu.contains(event.target)) closeMenu(); };
        const onScroll = () => closeMenu();
        const onKeyDown = (event) => { if (event.key === 'Escape') closeMenu(); };
        const onResize = () => closeMenu();
        document.addEventListener('pointerdown', onPointerDown, true);
        window.addEventListener('scroll', onScroll, true);
        document.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('resize', onResize);
        detach = () => {
          document.removeEventListener('pointerdown', onPointerDown, true);
          window.removeEventListener('scroll', onScroll, true);
          document.removeEventListener('keydown', onKeyDown, true);
          window.removeEventListener('resize', onResize);
        };
      };

      const onContextMenu = (event) => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return;
        const text = String(selection.toString() || '').trim();
        if (text === '') return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        if (target.closest('[contenteditable="true"]') || target.closest('[data-dsh-quote-menu]')) return;
        const chat = target.closest('[data-conversation-region="chat"]');
        if (!chat) return;
        const anchor = selection.anchorNode;
        const anchorElement = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentElement);
        const row = anchorElement && anchorElement.closest ? anchorElement.closest('[data-chat-flow-kind]') : null;
        if (!row) return;
        const sessionId = chat.getAttribute('data-conversation-session');
        if (!sessionId) return;
        const kind = row.getAttribute('data-chat-flow-kind') || '';
        const role = kind === 'user' || kind === 'steering' ? 'user' : 'assistant';
        event.preventDefault();
        event.stopPropagation();
        openMenu(event.clientX, event.clientY, { text, role, sessionId });
      };

      document.addEventListener('contextmenu', onContextMenu, true);
      return () => {
        closeMenu();
        document.removeEventListener('contextmenu', onContextMenu, true);
      };
    }

    /** Action-row button on a finalized assistant message: quote the whole reply. */
    function QuoteAction({ messageId, quote, t }) {
      return h('button', {
        type: 'button',
        title: t('quote'),
        onClick: (event) => { event.stopPropagation(); quote(messageId); },
        style: S.quoteBtn,
        onMouseEnter: (event) => { event.currentTarget.style.color = 'var(--dsw-alias-label-primary)'; },
        onMouseLeave: (event) => { event.currentTarget.style.color = 'var(--dsw-alias-label-secondary)'; },
      }, t('quote'));
    }

    return {
      inject: ['slots', 'locale', 'sessions'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('quote', 'zh', DICT.zh), 'quote: zh dict');
        ctx.effect(() => ctx.locale.register('quote', 'en', DICT.en), 'quote: en dict');
        const t = ctx.locale.bind('quote');

        const bindingOf = (sessionId) => ctx.sessions.binding(sessionId);

        /*
         * Safety net for "the bubble must not linger after a send": if the shell
         * submit bridge cannot fold the quote (or another send path wins), the
         * next user message in this session clears the bubble anyway. The bridge
         * itself clears first, so this normally never fires.
         */
        const quoteWatchers = new Map();
        const countUserMessages = (binding) => {
          try {
            const snapshot = binding.eventSource.getSnapshot();
            let total = 0;
            for (const entry of snapshot.entries) {
              if (entry.event && entry.event.type === 'user/message') total += 1;
            }
            return total;
          } catch (error) { return 0; }
        };
        const stopQuoteWatch = (sessionId) => {
          const record = quoteWatchers.get(String(sessionId));
          if (!record) return;
          quoteWatchers.delete(String(sessionId));
          try { record.stop(); } catch (error) {}
        };
        const watchQuoteDelivery = (sessionId) => {
          const key = String(sessionId);
          if (quoteWatchers.has(key)) return;
          try {
            const binding = bindingOf(sessionId);
            if (!binding || !binding.eventSource || typeof binding.eventSource.subscribe !== 'function') return;
            const baseline = countUserMessages(binding);
            const stop = binding.eventSource.subscribe(() => {
              if (quoteOf(sessionId) === null) { stopQuoteWatch(sessionId); return; }
              if (countUserMessages(binding) > baseline) {
                stopQuoteWatch(sessionId);
                setQuote(sessionId, null);
              }
            });
            quoteWatchers.set(key, { stop });
          } catch (error) { console.warn('[quote] delivery watch failed', error); }
        };
        ctx.effect(() => () => {
          for (const record of quoteWatchers.values()) { try { record.stop(); } catch (error) {} }
          quoteWatchers.clear();
        }, 'quote: delivery watchers');

        /**
         * Resolve the session composer shell and make sure its submit carries a
         * pending quote. The quote lives outside the editor: it is folded into the
         * draft only in the submit call, so the bubble — not the input box — shows it.
         */
        const bridgedShells = new WeakSet();
        const ensureQuoteBridge = (sessionId) => {
          const binding = bindingOf(sessionId);
          if (!binding) throw new Error('session not retained');
          const actx = ctx.sessions.scope(sessionId);
          const conversation = actx && actx.get ? actx.get('conversation') : undefined;
          if (!conversation || !conversation.input || typeof conversation.input.for !== 'function') throw new Error('conversation unavailable');
          const shell = conversation.input.for(actx);
          if (bridgedShells.has(shell)) return shell;
          /* Client halves hot-reload, but the composer shell outlives this module:
             keep the true submit and re-wrap it on every reload. */
          const originalSubmit = typeof shell.__dshQuoteOriginal === 'function' ? shell.__dshQuoteOriginal : shell.submit;
          if (typeof originalSubmit !== 'function') return shell;
          try { Object.defineProperty(shell, '__dshQuoteOriginal', { value: originalSubmit, configurable: true, writable: true }); } catch (e) { return shell; }
          bridgedShells.add(shell);
          shell.submit = function submitWithQuote(mode, source) {
            try {
              const quote = quoteOf(sessionId);
              const state = shell.snapshot;
              const draft = shell.draftSnapshot;
              if (quote && state && state.phase === 'plain' && draft && draft.command === undefined
                && !String(draft.text || '').trim().startsWith('/')) {
                const block = quoteBlockText(t, quote);
                const separator = draft.text === '' ? '' : '\n\n';
                const shift = block.length + separator.length;
                const references = (draft.references || []).map((reference) => ({ ...reference, offset: reference.offset + shift }));
                shell.setDraft({ text: block + separator + draft.text, references });
                stopQuoteWatch(sessionId);
                setQuote(sessionId, null);
              }
            } catch (error) {
              console.warn('[quote] submit bridge failed', error);
            }
            return originalSubmit.apply(this, arguments);
          };
          return shell;
        };

        const quoteFromMessage = (sessionId, messageId) => {
          let shell;
          try {
            const binding = bindingOf(sessionId);
            if (!binding) throw new Error('session not retained');
            let found;
            for (const entry of binding.eventSource.getSnapshot().entries) {
              const event = entry.event;
              if (!event || (event.type !== 'assistant/message' && event.type !== 'user/message')) continue;
              const message = event.data && event.data.message;
              if (message && message.id === messageId) { found = { event, message }; break; }
            }
            if (!found) throw new Error('message not found');
            const text = (found.message.content || [])
              .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
              .map((block) => block.text)
              .join('\n')
              .trim();
            if (text === '') throw new Error('no text');
            const role = found.event.type === 'assistant/message' ? 'assistant' : 'user';
            setQuote(sessionId, { text, role });
            shell = ensureQuoteBridge(sessionId);
            watchQuoteDelivery(sessionId);
          } catch (error) {
            console.warn('[quote] quote failed', error);
            try { shell = shell || ensureQuoteBridge(sessionId); } catch (e) {}
            try { if (shell && typeof shell.notify === 'function') shell.notify('error', t('quoteFailed')); } catch (e) {}
          }
        };

        const quoteFromSelection = (payload) => {
          if (!payload || !payload.text) return;
          setQuote(payload.sessionId, { text: payload.text, role: payload.role });
          try { ensureQuoteBridge(payload.sessionId); } catch (error) { console.warn('[quote] bridge failed', error); }
          watchQuoteDelivery(payload.sessionId);
        };

        ctx.effect(() => installQuoteMenu({ t, onQuote: quoteFromSelection }), 'quote: context menu');

        ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
          name: 'conversation.chat.assistant-actions', id: 'dsh-quote', order: 5,
          inject: (sessionId) => ({ quote: (messageId) => quoteFromMessage(sessionId, messageId) }),
        }, (props) => h(QuoteAction, { ...props, t })));

        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock', id: 'dsh-quote', order: 30,
          inject: (sessionId) => {
            try { ensureQuoteBridge(sessionId); } catch (error) { console.warn('[quote] bridge failed', error); }
            return {
              quote: {
                get: () => quoteOf(sessionId),
                subscribe: (listener) => subscribeQuote(sessionId, listener),
                remove: () => { stopQuoteWatch(sessionId); setQuote(sessionId, null); },
              },
            };
          },
        }, (props) => h(QuoteDock, { ...props, t })));
      },
    };
  },
});
