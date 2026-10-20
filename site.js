// Public pages: live server status and the department list.
(function () {
  const API = (window.KSRP && window.KSRP.api) || '';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const here = location.pathname.replace(/\/$/, '') || '/';
  $$('.nav-links a[href]').forEach((a) => {
    const p = new URL(a.href).pathname.replace(/\/$/, '').replace(/\.html$/, '') || '/';
    if (p === here.replace(/\.html$/, '')) a.classList.add('active');
  });

  async function status() {
    let s;
    try {
      s = await (await fetch(API + '/api/public/status', { credentials: 'include' })).json();
    } catch {
      s = { online: false };
    }
    $$('[data-stat="players"]').forEach((e) => (e.textContent = s.online ? s.players : '-'));
    $$('[data-stat="max"]').forEach((e) => (e.textContent = s.online ? `of ${s.maxPlayers} slots` : 'Server offline'));
    $$('[data-stat="queue"]').forEach((e) => (e.textContent = s.online ? s.queue : '-'));
    $$('[data-stat="session"]').forEach((e) => (e.textContent = s.session ? s.session.phase : 'No session'));
    $$('[data-stat="sessionTitle"]').forEach((e) => (e.textContent = s.session ? s.session.title : 'Check Discord for the next one'));
    $$('[data-stat="code"]').forEach((e) => (e.textContent = s.online && s.joinKey ? s.joinKey : '-'));
    $$('[data-live]').forEach((e) => {
      e.classList.toggle('live', Boolean(s.online));
      e.classList.toggle('off', !s.online);
    });
    $$('[data-live-text]').forEach((e) => (e.textContent = s.online ? (s.session ? 'Session live' : 'Server online') : 'Server offline'));
  }

  async function departments() {
    const grid = $('#departments');
    if (!grid) return;
    try {
      const { departments } = await (await fetch(API + '/api/public/departments')).json();
      grid.replaceChildren(
        ...departments.map((d) => {
          const card = document.createElement('article');
          card.className = 'card dept';
          const img = document.createElement('img');
          img.src = d.logo;
          img.alt = '';
          img.loading = 'lazy';
          const h = document.createElement('h3');
          h.textContent = d.name;
          const p = document.createElement('p');
          p.textContent = d.description;
          const a = document.createElement('a');
          a.className = 'btn small';
          a.href = d.link;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = 'Communications Server';
          card.append(img, h, p, a);
          return card;
        }),
      );
    } catch {
      grid.textContent = 'Departments could not be loaded.';
    }
  }

  status();
  setInterval(status, 30_000);
  departments();
})();
