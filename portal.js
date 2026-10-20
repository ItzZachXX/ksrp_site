// Staff portal: one page app. All data is put on the page with textContent, never innerHTML.
(function () {
  const API = (window.KSRP && window.KSRP.api) || '';
  const app = document.getElementById('app');

  // ---------- tiny helpers ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const svg = (d) => {
    const w = document.createElement('span');
    w.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
    return w.firstChild;
  };
  const ICONS = {
    overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    sessions: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    players: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3-5.5 6.5-5.5s6 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14.8c2 .6 3.3 2.3 3.5 5.2"/>',
    warnings: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18v.01"/>',
    ingame: '<path d="M21 12a8 8 0 01-11.5 7.2L4 20l1-4.5A8 8 0 1121 12z"/>',
    logs: '<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/>',
    audit: '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>',
    cad: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  };

  const dt = (ms) => new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  function ago(ms) {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
    return `${Math.floor(s / 86400)} d ago`;
  }
  function duration(from, to) {
    const m = Math.max(1, Math.round(((to || Date.now()) - from) / 60000));
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr ${m % 60} min`;
  }

  function toast(message, kind = 'ok') {
    const t = h('div', { class: `toast ${kind}`, text: message });
    document.getElementById('toasts').append(t);
    setTimeout(() => t.remove(), 4500);
  }

  async function api(method, path, body) {
    const res = await fetch(API + path, {
      method,
      credentials: 'include',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-Requested-With': 'ksrp' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }
  // Runs an action on a button: disables it, shows errors as a toast.
  async function act(btn, fn, okMessage) {
    btn.disabled = true;
    try {
      const out = await fn();
      if (okMessage) toast(okMessage);
      return out;
    } catch (e) {
      toast(e.message, 'bad');
      return null;
    } finally {
      btn.disabled = false;
    }
  }

  function modal({ title, sub, fields, confirm, danger, onSubmit }) {
    const inputs = {};
    const body = fields.map((f) => {
      const input = f.options
        ? h('select', {}, f.options.map(([v, l]) => h('option', { value: v, text: l })))
        : f.long ? h('textarea', { placeholder: f.placeholder || '' }) : h('input', { placeholder: f.placeholder || '', maxlength: f.max || 500, value: f.value || '' });
      inputs[f.name] = input;
      return h('label', { class: 'field' }, h('span', { text: f.label }), input);
    });
    const close = () => overlay.remove();
    const go = h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, text: confirm || 'Confirm' });
    go.addEventListener('click', async () => {
      const values = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value.trim()]));
      go.disabled = true;
      try {
        await onSubmit(values);
        close();
      } catch (e) {
        toast(e.message, 'bad');
        go.disabled = false;
      }
    });
    const overlay = h('div', { class: 'overlay', onclick: (e) => e.target === overlay && close() },
      h('div', { class: 'modal' }, h('h3', { text: title }), sub ? h('p', { class: 'sub', text: sub }) : null, body,
        h('div', { class: 'row end' }, h('button', { class: 'btn', text: 'Cancel', onclick: close }), go)));
    document.body.append(overlay);
    Object.values(inputs)[0]?.focus();
  }

  const stat = (label, value, sub) =>
    h('div', { class: 'card stat' }, h('div', { class: 'label', text: label }), h('div', { class: 'value', text: value }), h('div', { class: 'sub', text: sub || '' }));
  const empty = (msg) => h('div', { class: 'empty', text: msg });
  function table(headers, rows, emptyMsg) {
    if (!rows.length) return h('div', { class: 'table-wrap' }, empty(emptyMsg));
    return h('div', { class: 'table-wrap' },
      h('table', {}, h('thead', {}, h('tr', {}, headers.map((x) => h('th', { text: x })))),
        h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, c)))))));
  }
  const head = (title, sub, ...actions) =>
    h('div', { class: 'page-head' }, h('div', {}, h('h2', { text: title }), sub ? h('p', { text: sub }) : null), h('div', { class: 'row' }, actions));

  // append that skips empty values (a plain append would write the word "null")
  const put = (el, ...kids) => el.append(...kids.flat().filter(Boolean));

  // ---------- state ----------
  const state = { me: null, cfg: null };

  // ---------- views ----------
  const views = {};
  const P = (window.KSRP_PORTAL = { h, api, act, toast, modal, stat, empty, table, head, put, dt, ago, duration, svg, ICONS, state, views, API });

  views.overview = async (el) => {
    const o = await api('GET', '/api/staff/overview');
    const s = o.server;
    const sess = o.session;
    put(el, 
      head('Overview', 'Live status of the game server and your team.'),
      !s.online ? h('div', { class: 'notice warn', text: `Game server data is unavailable: ${s.error || 'offline'}` }) : null,
      h('div', { class: 'stats' },
        stat('Players', s.online ? String(s.players) : '-', s.online ? `of ${s.maxPlayers}` : 'Offline'),
        stat('In queue', s.online ? String(s.queue) : '-', 'Waiting to join'),
        stat('Staff in game', s.online && s.staffInGame != null ? String(s.staffInGame) : '-', 'Admins, mods, helpers'),
        stat('Join code', s.online ? s.joinKey : '-', ''),
      ),
      h('div', { class: 'cols' },
        h('div', { class: 'card' }, h('h3', { text: 'Current session' }),
          sess
            ? h('div', {}, h('dl', { class: 'kv' },
                h('dt', { text: 'Title' }), h('dd', { text: sess.title }),
                h('dt', { text: 'Phase' }), h('dd', {}, h('span', { class: 'badge blue', text: sess.phase })),
                h('dt', { text: 'Host' }), h('dd', { text: sess.hostName }),
                h('dt', { text: 'Running' }), h('dd', { text: duration(sess.startedAt) }),
                h('dt', { text: 'Peak players' }), h('dd', { text: String(sess.peakPlayers) })),
                h('div', { class: 'row', style: null }, h('a', { class: 'btn small', href: '#/sessions', text: 'Manage session' })))
            : h('div', {}, h('p', { class: 'muted', text: 'No session is running right now.' }), h('p', {}, h('a', { class: 'btn primary small', href: '#/sessions', text: 'Start a session' })))),
        h('div', { class: 'card' }, h('h3', { text: 'This week' }),
          h('dl', { class: 'kv' },
            h('dt', { text: 'Sessions' }), h('dd', { text: String(o.sessionsThisWeek) }),
            h('dt', { text: 'Warnings' }), h('dd', { text: String(o.warningsThisWeek) })))),
      h('div', { class: 'card' }, h('h3', { text: 'Recent staff activity' }),
        o.recent.length
          ? h('ul', { class: 'feed' }, o.recent.map((r) => h('li', {}, `${r.actor_name}: ${r.action}`, h('small', { text: `${r.detail || ''} ${ago(r.at)}` }))))
          : h('p', { class: 'muted', text: 'Nothing yet.' })),
    );
  };

  views.sessions = async (el) => {
    const data = await api('GET', '/api/staff/sessions');
    const a = data.active;
    const phaseSelect = (value) => {
      const sel = h('select', {}, state.cfg.phases.map((p) => h('option', { value: p, text: p })));
      sel.value = value || state.cfg.phases[0];
      return sel;
    };
    put(el, head('Sessions', 'Start, manage and end game sessions.'));
    if (!state.cfg.sessionChannelConfigured) {
      put(el, h('div', { class: 'notice warn', text: 'SESSION_CHANNEL_ID is not set, so sessions will not be announced in Discord.' }));
    }

    if (a) {
      const phase = phaseSelect(a.phase);
      const notes = h('textarea', { placeholder: 'Notes shown on the announcement' });
      notes.value = a.notes || '';
      const announce = h('input', { type: 'checkbox' });
      const save = h('button', { class: 'btn primary', text: 'Update session' });
      save.addEventListener('click', async () => {
        const out = await act(save, () => api('POST', `/api/staff/sessions/${a.id}/update`, { phase: phase.value, notes: notes.value, announceInGame: announce.checked }), 'Session updated.');
        if (out) render();
      });
      const end = h('button', { class: 'btn danger', text: 'End session' });
      end.addEventListener('click', () =>
        modal({ title: 'End this session?', sub: `${a.title} has been running for ${duration(a.startedAt)}.`, fields: [], confirm: 'End session', danger: true,
          onSubmit: async () => { await api('POST', `/api/staff/sessions/${a.id}/end`, { announceInGame: announce.checked }); toast('Session ended.'); render(); } }));
      put(el, h('div', { class: 'card' },
        h('div', { class: 'row' }, h('h3', { text: a.title }), h('span', { class: 'badge ok', text: 'Live' }), h('span', { class: 'hint', text: `Started ${dt(a.startedAt)} by ${a.hostName}. Peak ${a.peakPlayers} players.` })),
        h('div', { class: 'cols' },
          h('label', { class: 'field' }, h('span', { text: 'Phase' }), phase),
          h('label', { class: 'field' }, h('span', { text: 'Notes' }), notes)),
        h('label', { class: 'check' }, announce, 'Also announce this change in game'),
        h('div', { class: 'row' }, save, end)));
    } else {
      const title = h('input', { placeholder: 'Kentucky State Roleplay Session', maxlength: 80 });
      const phase = phaseSelect();
      const notes = h('textarea', { placeholder: 'Notes shown on the announcement (optional)' });
      const announce = h('input', { type: 'checkbox' });
      const start = h('button', { class: 'btn primary', text: 'Start session' });
      start.addEventListener('click', async () => {
        const out = await act(start, () => api('POST', '/api/staff/sessions', { title: title.value, phase: phase.value, notes: notes.value, announceInGame: announce.checked }));
        if (out) {
          toast(out.announced ? 'Session started and announced.' : `Session started. Not announced: ${out.announceError}`, out.announced ? 'ok' : 'bad');
          render();
        }
      });
      put(el, h('div', { class: 'card' }, h('h3', { text: 'Start a session' }),
        h('div', { class: 'cols' },
          h('label', { class: 'field' }, h('span', { text: 'Title' }), title),
          h('label', { class: 'field' }, h('span', { text: 'Starting phase' }), phase)),
        h('label', { class: 'field' }, h('span', { text: 'Notes' }), notes),
        h('label', { class: 'check' }, announce, 'Also announce in game'),
        start));
    }

    put(el, h('h3', { text: 'Past sessions' }),
      table(['Title', 'Host', 'Started', 'Length', 'Peak', 'Phase'],
        data.history.map((s) => [s.title, s.hostName, dt(s.startedAt), duration(s.startedAt, s.endedAt), String(s.peakPlayers), s.phase]),
        'No past sessions yet.'));
  };

  views.players = async (el) => {
    const data = await api('GET', '/api/staff/players');
    const filter = h('input', { placeholder: 'Filter by name, team or callsign' });
    const holder = h('div', {});
    const draw = () => {
      const q = filter.value.trim().toLowerCase();
      const rows = data.players
        .filter((p) => !q || [p.name, p.team, p.callsign].some((x) => String(x || '').toLowerCase().includes(q)))
        .map((p) => [
          h('b', { text: p.name }),
          p.team,
          p.callsign || '-',
          p.location || '-',
          p.permission === 'Normal' ? '-' : h('span', { class: 'badge blue', text: p.permission.replace('Server ', '') }),
          h('div', { class: 'row' },
            h('a', { class: 'btn small', href: `#/ingame?pm=${encodeURIComponent(p.name)}`, text: 'Message' }),
            h('button', { class: 'btn small danger', text: 'Kick', onclick: () => kickModal(p.name) })),
        ]);
      holder.replaceChildren(table(['Player', 'Team', 'Callsign', 'Location', 'Role', ''], rows, 'No players match.'));
    };
    filter.addEventListener('input', draw);
    draw();
    put(el, head('Players', `${data.count} of ${data.max} in game.`, h('button', { class: 'btn small', text: 'Refresh', onclick: render })), h('div', { class: 'card flat' }, filter), h('div', { class: 'stack' }, holder));
  };

  function kickModal(player) {
    modal({ title: `Kick ${player}`, sub: 'The reason is recorded in the audit log.', fields: [{ name: 'reason', label: 'Reason', placeholder: 'Why are they being removed?', max: 500 }], confirm: 'Kick player', danger: true,
      onSubmit: async (v) => { await api('POST', '/api/staff/ingame/moderate', { action: 'kick', player, reason: v.reason }); toast(`${player} was kicked.`); } });
  }

  views.warnings = async (el) => {
    let selected = null;
    const search = h('input', { placeholder: 'Search a member by name or paste their Discord ID' });
    const results = h('div', {});
    const panel = h('div', { class: 'stack' });
    let timer;

    async function recent() {
      const { warnings } = await api('GET', '/api/staff/warnings');
      panel.replaceChildren(h('h3', { text: 'Recent cases' }), caseTable(warnings, true));
    }

    function caseTable(list, showUser) {
      return table([...(showUser ? ['Member'] : []), 'Case', 'Type', 'Reason', 'Issued by', 'Date', ''],
        list.map((w) => [
          ...(showUser ? [w.userName || w.userId] : []),
          `#${w.id}`,
          h('span', { class: `badge ${w.type === 'strike' ? 'bad' : w.type === 'note' ? '' : 'warn'}`, text: w.type }),
          w.revoked ? h('span', { class: 'muted', text: `(revoked) ${w.reason}` }) : w.reason,
          w.issuerName, ago(w.createdAt),
          state.me.level === 'admin' && !w.revoked
            ? h('button', { class: 'btn small', text: 'Revoke', onclick: () => modal({ title: `Revoke case #${w.id}?`, fields: [], confirm: 'Revoke', danger: true,
                onSubmit: async () => { await api('POST', `/api/staff/warnings/${w.id}/revoke`, {}); toast('Case revoked.'); select(selected); } }) })
            : '',
        ]), 'No cases.');
    }

    async function select(member) {
      selected = member;
      results.replaceChildren();
      search.value = '';
      if (!member) return recent();
      const { warnings } = await api('GET', `/api/staff/warnings?userId=${member.id}`);
      const type = h('select', {}, state.cfg.warningTypes.map((t) => h('option', { value: t, text: t })));
      const reason = h('textarea', { placeholder: 'What happened? This is sent to the member and logged.' });
      const send = h('button', { class: 'btn primary', text: 'Issue' });
      send.addEventListener('click', async () => {
        const out = await act(send, () => api('POST', '/api/staff/warnings', { userId: member.id, type: type.value, reason: reason.value }));
        if (out) { toast(out.dmSent ? `Case #${out.id} issued and the member was messaged.` : `Case #${out.id} issued. Their DMs are closed or it is a note.`); select(member); }
      });
      panel.replaceChildren(
        h('div', { class: 'card' }, h('div', { class: 'row' }, h('h3', { text: member.name }), h('span', { class: 'hint mono', text: member.id }), h('button', { class: 'btn small', text: 'Clear', onclick: () => select(null) })),
          h('div', { class: 'cols' }, h('label', { class: 'field' }, h('span', { text: 'Type' }), type), h('div', {})),
          h('label', { class: 'field' }, h('span', { text: 'Reason' }), reason), send),
        h('h3', { text: `History (${warnings.filter((w) => !w.revoked).length} active)` }),
        caseTable(warnings, false));
    }

    search.addEventListener('input', () => {
      clearTimeout(timer);
      const q = search.value.trim();
      if (q.length < 2) return results.replaceChildren();
      timer = setTimeout(async () => {
        try {
          const { members } = await api('GET', `/api/staff/members/search?q=${encodeURIComponent(q)}`);
          results.replaceChildren(members.length
            ? h('div', { class: 'results' }, members.map((m) => h('button', { onclick: () => select(m) }, h('span', { text: m.name }), h('span', { class: 'hint', text: m.tag }))))
            : h('p', { class: 'hint', text: 'No members found.' }));
        } catch (e) { toast(e.message, 'bad'); }
      }, 250);
    });

    put(el, head('Warnings', 'Look up a member, view their history and issue cases.'), h('div', { class: 'card flat' }, search, results), panel);
    recent();
  };

  views.ingame = async (el, query) => {
    const tabs = [['m', 'Server message'], ['h', 'Hint'], ['pm', 'Private message']];
    let kind = query.get('pm') ? 'pm' : 'm';
    const text = h('textarea', { placeholder: 'Message' });
    const target = h('input', { placeholder: 'Roblox username', maxlength: 20, value: query.get('pm') || '' });
    const counter = h('span', { class: 'hint' });
    const targetField = h('label', { class: 'field' }, h('span', { text: 'Player' }), target);
    const tabBar = h('div', { class: 'tabs' });
    const sendBtn = h('button', { class: 'btn primary', text: 'Send' });
    const limit = () => (kind === 'm' ? 200 : 150);
    const refresh = () => {
      tabBar.replaceChildren(...tabs.map(([k, label]) => h('button', { class: k === kind ? 'active' : '', text: label, onclick: () => { kind = k; refresh(); } })));
      targetField.classList.toggle('hidden', kind !== 'pm');
      text.maxLength = limit();
      counter.textContent = `${text.value.length} / ${limit()}`;
    };
    text.addEventListener('input', refresh);
    sendBtn.addEventListener('click', async () => {
      const out = await act(sendBtn, () => api('POST', '/api/staff/ingame/message', { type: kind, text: text.value, target: target.value }));
      if (out) { toast('Sent in game.'); text.value = ''; refresh(); }
    });

    const player = h('input', { placeholder: 'Roblox username', maxlength: 20 });
    const reason = h('textarea', { placeholder: 'Reason (recorded in the audit log and mod log)' });
    const doMod = (action) => async (e) => {
      const btn = e.currentTarget;
      const out = await act(btn, () => api('POST', '/api/staff/ingame/moderate', { action, player: player.value, reason: reason.value }));
      if (out) { toast(`${player.value} was ${action === 'ban' ? 'banned' : 'kicked'}.`); player.value = ''; reason.value = ''; }
    };

    put(el, head('In-game', 'Send messages and take action on the game server. The game allows one command about every 5 seconds.'),
      h('div', { class: 'cols' },
        h('div', { class: 'card' }, h('h3', { text: 'Send a message' }), tabBar, targetField,
          h('label', { class: 'field' }, h('span', { text: 'Message' }), text), h('div', { class: 'row' }, sendBtn, counter)),
        h('div', { class: 'card' }, h('h3', { text: 'Moderate a player' }),
          h('label', { class: 'field' }, h('span', { text: 'Player' }), player),
          h('label', { class: 'field' }, h('span', { text: 'Reason' }), reason),
          h('div', { class: 'row' }, h('button', { class: 'btn danger', text: 'Kick', onclick: doMod('kick') }),
            state.me.level === 'admin' ? h('button', { class: 'btn danger', text: 'Ban', onclick: doMod('ban') }) : null),
          state.me.level === 'admin' ? null : h('p', { class: 'hint', text: 'Bans are limited to Management.' }))));
    refresh();
  };

  views.logs = async (el) => {
    const logs = await api('GET', '/api/staff/logs');
    const at = (s) => dt(s * 1000);
    const sets = {
      Kills: () => table(['Time', 'Killer', 'Killed'], logs.kills.map((k) => [at(k.Timestamp), k.Killer, k.Killed]), 'No kills logged.'),
      Commands: () => table(['Time', 'Player', 'Command'], logs.commands.map((c) => [at(c.Timestamp), c.Player, h('span', { class: 'mono', text: c.Command })]), 'No commands logged.'),
      'Mod calls': () => table(['Time', 'Caller', 'Moderator'], logs.modCalls.map((m) => [at(m.Timestamp), m.Caller, m.Moderator || h('span', { class: 'muted', text: 'Unanswered' })]), 'No mod calls.'),
      Joins: () => table(['Time', 'Player', 'Event'], logs.joins.map((j) => [at(j.Timestamp), j.Player, h('span', { class: `badge ${j.Join ? 'ok' : ''}`, text: j.Join ? 'Joined' : 'Left' })]), 'No joins logged.'),
    };
    const body = h('div', {});
    const bar = h('div', { class: 'tabs' });
    let current = 'Kills';
    const draw = () => {
      bar.replaceChildren(...Object.keys(sets).map((k) => h('button', { class: k === current ? 'active' : '', text: k, onclick: () => { current = k; draw(); } })));
      body.replaceChildren(sets[current]());
    };
    put(el, head('Server logs', 'The most recent activity from the game server.', h('button', { class: 'btn small', text: 'Refresh', onclick: render })), bar, body);
    draw();
  };

  views.audit = async (el) => {
    const { entries } = await api('GET', '/api/staff/audit');
    put(el, head('Audit log', 'Everything staff do in the portal. Management only.'),
      table(['When', 'Staff', 'Action', 'Detail'], entries.map((e) => [dt(e.at), e.actor_name, e.action, h('span', { class: 'muted', text: e.detail || '' })]), 'Nothing logged yet.'));
  };

  // ---------- shell ----------
  const NAV = [
    ['overview', 'Overview'], ['sessions', 'Sessions'], ['players', 'Players'], ['warnings', 'Warnings'],
    ['ingame', 'In-game'], ['logs', 'Server logs'], ['audit', 'Audit log', 'admin'],
  ];
  let mainEl;
  const STAFF_VIEWS = ['overview', 'sessions', 'players', 'warnings', 'ingame', 'logs', 'audit'];
  const isStaffLevel = () => state.me.level === 'staff' || state.me.level === 'admin';

  function parseHash() {
    const home = isStaffLevel() ? 'overview' : 'cad';
    const [path, qs] = (location.hash.replace(/^#\/?/, '') || home).split('?');
    return { name: views[path] ? path : home, query: new URLSearchParams(qs || '') };
  }

  async function render() {
    const { name, query } = parseHash();
    document.querySelectorAll('.side nav a[data-v]').forEach((a) => a.classList.toggle('active', a.dataset.v === name));
    if (name === 'audit' && state.me.level !== 'admin') return (location.hash = isStaffLevel() ? '#/overview' : '#/cad');
    if (!isStaffLevel() && STAFF_VIEWS.includes(name)) return (location.hash = '#/cad');
    mainEl.replaceChildren(h('div', { class: 'loading', text: 'Loading...' }));
    const fresh = h('div', {});
    try {
      await views[name](fresh, query);
    } catch (e) {
      if (e.status === 401) return location.reload();
      fresh.replaceChildren(h('div', { class: 'notice', text: e.message }));
    }
    mainEl.replaceChildren(fresh);
  }

  function shell() {
    const avatar = state.me.avatar
      ? h('img', { src: `https://cdn.discordapp.com/avatars/${state.me.id}/${state.me.avatar}.png?size=64`, alt: '' })
      : h('div', { class: 'ph' });
    const logout = h('button', { class: 'btn small', text: 'Log out' });
    logout.addEventListener('click', async () => { await api('POST', '/auth/logout', {}).catch(() => {}); location.href = '/'; });
    mainEl = h('main', { class: 'main' });
    app.replaceChildren(h('div', { class: 'portal' },
      h('aside', { class: 'side' },
        h('a', { class: 'brand', href: '/' }, h('img', { src: '/logo.png', alt: '' }), h('span', { text: 'Staff Portal' })),
        h('nav', {},
          isStaffLevel() ? h('div', { class: 'group', text: 'Staff' }) : null,
          isStaffLevel() ? NAV.filter(([, , need]) => !need || state.me.level === 'admin').map(([id, label]) => h('a', { href: `#/${id}`, 'data-v': id }, svg(ICONS[id]), label)) : null,
          h('div', { class: 'group', text: 'CAD' }),
          (P.cadNav ? P.cadNav() : []).map(([id, label, icon]) => h('a', { href: `#/${id}`, 'data-v': id }, svg(ICONS[icon] || ICONS.cad), label))),
        h('div', { class: 'userchip' }, avatar, h('div', { class: 'who' }, h('b', { text: state.me.name }), h('small', { text: state.me.level })), logout)),
      mainEl));
    window.addEventListener('hashchange', render);
    render();
  }

  function loginScreen(error, message) {
    const err = new URLSearchParams(location.search).get('error');
    app.replaceChildren(h('div', { class: 'login-screen' }, h('div', { class: 'card login-card' },
      h('img', { src: '/logo.png', alt: '' }), h('h2', { text: 'Staff Portal' }),
      h('p', { text: message || 'Sign in with Discord to continue. Access is based on your roles in the server.' }),
      err || (error && error !== 'noaccess') ? h('div', { class: 'notice', text: err || error }) : null,
      error === 'noaccess'
        ? h('button', { class: 'btn block', text: 'Log out', onclick: async () => { await api('POST', '/auth/logout', {}).catch(() => {}); location.reload(); } })
        : h('a', { class: 'btn primary block', href: `${API}/auth/login`, text: 'Log in with Discord' }),
      h('p', {}, h('a', { href: '/', class: 'hint', text: 'Back to the website' })))));
  }

  async function boot() {
    try {
      state.me = await api('GET', '/api/me');
    } catch {
      return loginScreen('Could not reach the server.');
    }
    if (!state.me.loggedIn) return loginScreen();
    if (!state.me.inGuild) return loginScreen('noaccess', 'You are not in the Kentucky State Roleplay Discord server.');
    if (state.me.level === 'none') return loginScreen('noaccess', `Signed in as ${state.me.name}, but you need a department role or the Staff Team role to use this portal.`);
    state.cfg = isStaffLevel() ? await api('GET', '/api/staff/config') : {};
    if (P.cadInit) await P.cadInit().catch(() => {});
    shell();
  }
  boot();
})();
