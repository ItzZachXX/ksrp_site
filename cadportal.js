// CAD: my shift and quota, live map, dispatch board, records, and the supervisor roster.
// Loads after portal.js and adds its pages to it. Everything is placed with textContent, never innerHTML.
(function () {
  const P = window.KSRP_PORTAL;
  if (!P) return;
  const { h, api, act, toast, modal, stat, empty, table, head, dt, ago, views, state } = P;

  let me = null; // /api/cad/me

  P.cadInit = async () => {
    me = await api('GET', '/api/cad/me');
  };
  P.cadNav = () => [
    ['cad', 'My shift', 'sessions'],
    ['map', 'Live map', 'players'],
    ['dispatch', 'Dispatch', 'ingame'],
    ['records', 'Records', 'logs'],
    ...(me && me.supervisorOf.length ? [['roster', 'Roster', 'audit']] : []),
  ];

  // ---------- small helpers ----------
  const mins = (s) => `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}h ` : ''}${Math.floor((s % 3600) / 60)}m`;
  const clock = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
  };
  const deptLabel = (id) => (me.departments.find((d) => d.id === id) || {}).name || id.toUpperCase();
  const DEPT_NAMES = { opd: 'Owensboro PD', dcso: 'Daviess County SO', ksp: 'Kentucky State Police', ofd: 'Owensboro FD', amr: 'AMR', co: 'Civilian Operations' };
  const dn = (id) => DEPT_NAMES[id] || id;
  const bar = (value, max, cls) => h('div', { class: 'bar' }, h('i', { class: cls || '', style: `width:${Math.min(100, (value / max) * 100).toFixed(1)}%` }));
  const live = (root, fn, every) => {
    const id = setInterval(() => (root.isConnected ? fn() : clearInterval(id)), every);
    return id;
  };
  const statusClass = (s) => ({ Available: 'ok', 'En route': 'blue', 'On scene': 'warn', Busy: 'bad', 'On break': '' }[s] || '');
  const PRIO = { 1: ['Low', ''], 2: ['Medium', 'warn'], 3: ['High', 'bad'] };
  const field = (label, ...kids) => h('label', { class: 'field' }, h('span', { text: label }), ...kids);

  // ======================================================================
  // My shift
  // ======================================================================
  views.cad = async (el) => {
    me = await api('GET', '/api/cad/me');
    const hist = await api('GET', '/api/cad/shift/history');
    const rerender = () => views.cad(el).then(() => {});
    el.replaceChildren();

    const body = h('div', {});
    body.append(head('My shift', `Clock in to be listed on the map and the dispatch board. The weekly quota is ${me.quotaMinutes} minutes.`));
    if (!me.departments.length && !me.isStaff) body.append(h('div', { class: 'notice warn', text: 'You do not have a department role, so you cannot start a shift.' }));

    // shift card
    const shiftCard = h('div', { class: 'card' }, h('h3', { text: 'Shift' }));
    if (me.shift) {
      const timer = h('div', { class: 'big-timer', text: clock(Date.now() - me.shift.startedAt) });
      live(timer, () => (timer.textContent = clock(Date.now() - me.shift.startedAt)), 1000);
      const buttons = me.statuses.map((s) => {
        const b = h('button', { class: `btn small ${me.shift.status === s ? 'primary' : ''}`, text: s });
        b.addEventListener('click', async () => {
          if (await act(b, () => api('POST', '/api/cad/shift/status', { status: s }))) rerender();
        });
        return b;
      });
      const end = h('button', { class: 'btn danger', text: 'End shift' });
      end.addEventListener('click', async () => {
        const r = await act(end, () => api('POST', '/api/cad/shift/end', {}));
        if (r) {
          toast(`Shift ended after ${r.minutes} minute(s).`);
          rerender();
        }
      });
      shiftCard.append(
        h('div', { class: 'row' }, h('span', { class: 'badge blue', text: deptLabel(me.shift.department) }), h('span', { class: 'badge', text: `Callsign ${me.shift.callsign}` }), h('span', { class: `badge ${statusClass(me.shift.status)}`, text: me.shift.status })),
        timer,
        h('div', { class: 'row' }, buttons),
        h('div', { class: 'spacer' }),
        end,
      );
    } else {
      const dept = h('select', {}, me.departments.map((d) => h('option', { value: d.id, text: d.name })));
      const call = h('input', { placeholder: 'For example A-12', maxlength: 20, value: me.profile.callsign });
      const go = h('button', { class: 'btn primary', text: 'Start shift' });
      go.addEventListener('click', async () => {
        if (await act(go, () => api('POST', '/api/cad/shift/start', { department: dept.value, callsign: call.value }))) rerender();
      });
      shiftCard.append(h('p', { class: 'muted', text: 'You are off duty.' }), field('Department', dept), field('Callsign', call), go);
    }

    // quota card
    const w = me.week;
    const quotaCard = h('div', { class: 'card' }, h('h3', { text: 'Weekly quota' }),
      h('div', { class: 'quota-num', text: `${mins(w.seconds)} of ${me.quotaMinutes}m` }),
      bar(w.seconds, w.targetSeconds, w.met ? 'ok' : ''),
      h('p', { class: 'muted', text: w.met ? 'Quota met for this week.' : `${mins(Math.max(0, w.targetSeconds - w.seconds))} still to go this week.` }),
      h('p', { class: 'hint', text: `The week ends ${dt(w.weekEnd)}. Missing it is a ${me.ladder.join(', then ')} on each following miss.` }));

    // profile card
    const rb = h('input', { placeholder: 'Roblox username', maxlength: 40, value: me.profile.robloxName });
    const cs = h('input', { placeholder: 'Default callsign', maxlength: 20, value: me.profile.callsign });
    const save = h('button', { class: 'btn', text: 'Save' });
    save.addEventListener('click', async () => {
      if (await act(save, () => api('POST', '/api/cad/profile', { robloxName: rb.value, callsign: cs.value }), 'Saved.')) me = await api('GET', '/api/cad/me');
    });
    const profile = h('div', { class: 'card' }, h('h3', { text: 'Your in-game name' }),
      h('p', { class: 'muted', text: 'Add your Roblox username so the map can show which dot is you and mark your callsign.' }), field('Roblox username', rb), field('Callsign', cs), save);

    body.append(h('div', { class: 'grid-3 cad-grid' }, shiftCard, quotaCard, profile));

    body.append(h('h3', { class: 'section', text: 'Recent shifts' }),
      table(['Started', 'Length', 'Department', 'Callsign'], hist.shifts.map((s) => [dt(s.started_at), s.ended_at ? mins((s.ended_at - s.started_at) / 1000) : 'On duty', dn(s.department), s.callsign || ''] ), 'No shifts yet.'));
    body.append(h('h3', { class: 'section', text: 'My record' }),
      table(['Date', 'Type', 'Department', 'Reason', 'Status'], hist.actions.map((a) => [dt(a.created_at), h('span', { class: `badge ${a.type === 'strike' || a.type === 'termination' ? 'bad' : 'warn'}`, text: a.type }), dn(a.department), h('span', { class: 'muted', text: `${a.reason}${a.auto ? ' (automatic)' : ''}` }), a.status]), 'Nothing on your record.'));
    el.append(body);
  };

  // ======================================================================
  // Live map
  // ======================================================================
  const TEAM_COLOR = { Police: '#4f8cff', Sheriff: '#f5c451', Fire: '#f87171', EMS: '#34d399', DOT: '#fb923c', Civilian: '#9aa7c4' };
  const teamColor = (t) => TEAM_COLOR[t] || '#9aa7c4';

  let maskData = null; // jurisdiction mask for the "outside your area" check
  function loadMask() {
    if (maskData) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      try {
        maskData = { w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data };
      } catch {
        maskData = null;
      }
    };
    img.src = '/cad-jd-mask.png';
  }
  const insideJD = (u, v) => {
    if (!maskData || u < 0 || v < 0 || u > 1 || v > 1) return null;
    const x = Math.min(maskData.w - 1, Math.floor(u * maskData.w));
    const y = Math.min(maskData.h - 1, Math.floor(v * maskData.h));
    return maskData.d[(y * maskData.w + x) * 4] > 128;
  };

  function buildMap(opts) {
    // opts.onPick(u,v): called when the map is clicked in pick mode
    const IMG_W = 900;
    const IMG_H = 1144;
    const stage = h('div', { class: 'map-stage' });
    const base = h('img', { src: '/cad-map.png', alt: '', draggable: 'false' });
    const jd = h('img', { src: '/cad-jd.png', alt: '', draggable: 'false', class: 'jd' });
    const markers = h('div', { class: 'map-markers' });
    stage.append(base, jd, markers);
    const view = h('div', { class: 'map-view' }, stage);
    const zoomBox = h('div', { class: 'map-zoom' },
      h('button', { class: 'btn small', text: '+', onclick: () => zoomAt(1.4) }),
      h('button', { class: 'btn small', text: '-', onclick: () => zoomAt(1 / 1.4) }),
      h('button', { class: 'btn small', text: 'Reset', onclick: () => fit() }));
    const wrap = h('div', { class: 'map-wrap' }, view, zoomBox);

    let scale = 1;
    let tx = 0;
    let ty = 0;
    let touched = false; // once the user pans or zooms, stop auto fitting
    const apply = () => {
      stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      stage.style.setProperty('--inv', String(1 / scale));
    };
    function fit() {
      touched = false;
      const r = view.getBoundingClientRect();
      if (!r.width || !r.height) return;
      scale = Math.min(r.width / IMG_W, r.height / IMG_H);
      tx = (r.width - IMG_W * scale) / 2;
      ty = (r.height - IMG_H * scale) / 2;
      apply();
    }
    function zoomAt(f, cx, cy) {
      const r = view.getBoundingClientRect();
      const px = cx == null ? r.width / 2 : cx - r.left;
      const py = cy == null ? r.height / 2 : cy - r.top;
      touched = true;
      const next = Math.max(0.15, Math.min(8, scale * f));
      const k = next / scale;
      tx = px - (px - tx) * k;
      ty = py - (py - ty) * k;
      scale = next;
      apply();
    }
    view.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX, e.clientY); }, { passive: false });

    let drag = null;
    view.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.mk')) return;
      drag = { x: e.clientX, y: e.clientY, tx, ty, moved: false };
      view.setPointerCapture(e.pointerId);
    });
    view.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; touched = true; }
      tx = drag.tx + dx;
      ty = drag.ty + dy;
      apply();
    });
    view.addEventListener('pointerup', (e) => {
      const d = drag;
      drag = null;
      if (d && !d.moved && opts.onPick) {
        const r = base.getBoundingClientRect();
        opts.onPick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      }
    });
    new ResizeObserver(() => { if (!touched) fit(); }).observe(view);

    return {
      wrap, markers, fit, setJD: (on) => jd.classList.toggle('hidden', !on),
      setPick: (on) => view.classList.toggle('picking', on),
      flyTo(u, v) {
        const r = view.getBoundingClientRect();
        touched = true;
        scale = Math.max(scale, 1.6);
        tx = r.width / 2 - u * IMG_W * scale;
        ty = r.height / 2 - v * IMG_H * scale;
        apply();
      },
    };
  }

  views.map = async (el) => {
    me = await api('GET', '/api/cad/me');
    loadMask();
    const filters = { Police: true, Sheriff: true, Fire: true, EMS: true, DOT: true, Civilian: false, calls: true, jd: false, labels: true };
    let data = null;
    let selected = null; // { kind: 'player'|'call', key }
    let pick = null; // null | { type: 'call' } | { type: 'calibrate', player, points: [] }
    const calPoints = [];

    const map = buildMap({ onPick: (u, v) => onPick(u, v) });
    map.setJD(filters.jd);
    const side = h('div', { class: 'map-side' });
    const banner = h('div', {});
    const infoBox = h('div', { class: 'map-info' });

    function pos(x, z) {
      const c = data && data.calibration;
      if (!c || x == null || z == null) return null;
      return { u: c.ax * x + c.bx, v: c.az * z + c.bz };
    }
    const place = (node, p) => {
      node.style.left = `${p.u * 100}%`;
      node.style.top = `${p.v * 100}%`;
      return node;
    };

    function onPick(u, v) {
      if (!pick) return;
      if (pick.type === 'call') {
        const c = data.calibration;
        pick = null;
        map.setPick(false);
        openNewCall(c ? { x: (u - c.bx) / c.ax, z: (v - c.bz) / c.az } : {});
      } else if (pick.type === 'calibrate' && pick.player) {
        calPoints.push({ x: pick.player.x, z: pick.player.z, u, v, name: pick.player.name });
        pick.player = null;
        renderSide();
        draw();
      }
    }

    function openNewCall(at) {
      modal({
        title: 'New call', sub: at.x == null ? 'No position (the map is not calibrated).' : 'Placed where you clicked.',
        fields: [
          { name: 'title', label: 'Type of call', placeholder: 'For example Traffic stop', max: 80 },
          { name: 'location', label: 'Location', placeholder: 'Street or landmark', max: 200 },
          { name: 'description', label: 'Details', long: true },
          { name: 'priority', label: 'Priority', options: [['1', 'Low'], ['2', 'Medium'], ['3', 'High']] },
        ],
        confirm: 'Create call',
        onSubmit: async (v) => {
          await api('POST', '/api/cad/calls', { title: v.title, location: v.location, description: v.description, priority: Number(v.priority || 2), x: at.x, z: at.z });
          toast('Call created.');
          refresh();
        },
      });
    }

    function draw() {
      map.markers.replaceChildren();
      if (!data) return;
      const cal = data.calibration;
      if (cal) {
        for (const p of data.players) {
          if (!filters[p.team] && !(filters[p.team] === undefined && filters.Civilian)) continue;
          const at = pos(p.x, p.z);
          if (!at) continue;
          const out = p.unit && me.restrictedJurisdiction.includes(p.unit.department) ? insideJD(at.u, at.v) === false : false;
          const mk = h('button', { class: `mk player${p.unit ? ' unit' : ''}${out ? ' out' : ''}${selected && selected.key === p.name ? ' sel' : ''}`, title: `${p.callsign || p.name} (${p.team})` },
            h('i', { style: `background:${teamColor(p.team)}` }),
            filters.labels && (p.callsign || p.team !== 'Civilian') ? h('span', { text: p.callsign || p.name }) : null);
          mk.addEventListener('click', (e) => { e.stopPropagation(); selected = { kind: 'player', key: p.name }; draw(); renderInfo(); });
          map.markers.append(place(mk, at));
        }
        if (filters.calls) {
          for (const c of data.calls) {
            const at = pos(c.x, c.z);
            if (!at) continue;
            const mk = h('button', { class: `mk call p${c.priority}${selected && selected.key === c.id ? ' sel' : ''}`, title: c.title }, h('i', { text: String(c.id) }));
            mk.addEventListener('click', (e) => { e.stopPropagation(); selected = { kind: 'call', key: c.id }; draw(); renderInfo(); });
            map.markers.append(place(mk, at));
          }
        }
      }
      for (const p of calPoints) map.markers.append(place(h('div', { class: 'mk cal' }, h('i', { text: '+' }), h('span', { text: p.name })), { u: p.u, v: p.v }));
    }

    function renderInfo() {
      infoBox.replaceChildren();
      if (!selected || !data) return;
      if (selected.kind === 'player') {
        const p = data.players.find((x) => x.name === selected.key);
        if (!p) return;
        const at = pos(p.x, p.z);
        const out = p.unit && me.restrictedJurisdiction.includes(p.unit.department) && at ? insideJD(at.u, at.v) === false : false;
        infoBox.append(h('div', { class: 'card flat' },
          h('div', { class: 'row' }, h('b', { text: p.callsign || p.name }), h('span', { class: 'badge', text: p.team })),
          h('p', { class: 'muted', text: `${p.name}${p.permission ? ` - ${p.permission}` : ''}` }),
          p.street ? h('p', { text: `${p.street}${p.postal ? `, postal ${p.postal}` : ''}` }) : null,
          p.unit ? h('div', { class: 'row' }, h('span', { class: 'badge blue', text: dn(p.unit.department) }), h('span', { class: `badge ${statusClass(p.unit.status)}`, text: p.unit.status })) : null,
          out ? h('div', { class: 'notice', text: 'This unit is outside the department jurisdiction.' }) : null));
      } else {
        const c = data.calls.find((x) => x.id === selected.key);
        if (c) infoBox.append(callCard(c, () => refresh(), true));
      }
    }

    function renderSide() {
      side.replaceChildren();
      const cal = data && data.calibration;
      banner.replaceChildren();
      if (!cal) {
        banner.append(h('div', { class: 'notice warn', text: me.isStaff && state.me.level === 'admin' ? 'The map is not calibrated yet, so positions are hidden. Use Calibrate below.' : 'The map is not calibrated yet, so positions are hidden. Ask a Management member to calibrate it.' }));
      }
      const checks = ['Police', 'Sheriff', 'Fire', 'EMS', 'DOT', 'Civilian'].map((t) => toggle(t, filters[t], (v) => { filters[t] = v; draw(); }, teamColor(t)));
      side.append(
        h('div', { class: 'card flat' }, h('h3', { text: 'Show' }), h('div', { class: 'toggles' }, checks,
          toggle('911 calls', filters.calls, (v) => { filters.calls = v; draw(); }),
          toggle('Jurisdiction', filters.jd, (v) => { filters.jd = v; map.setJD(v); }),
          toggle('Labels', filters.labels, (v) => { filters.labels = v; draw(); }))),
        h('div', { class: 'row' },
          h('button', { class: 'btn small primary', text: 'Add call on map', onclick: () => { pick = { type: 'call' }; map.setPick(true); toast('Click the map where the call is.'); } }),
          state.me.level === 'admin' ? h('button', { class: 'btn small', text: calibrating() ? 'Stop calibrating' : 'Calibrate', onclick: toggleCal }) : null),
      );
      if (calibrating()) side.append(calPanel());
      if (data) {
        const units = data.players.filter((p) => p.team !== 'Civilian');
        side.append(h('div', { class: 'card flat' }, h('h3', { text: `On the map (${data.playerCount ?? data.players.length} players)` }),
          h('div', { class: 'list' }, (units.length ? units : []).slice(0, 60).map((p) => {
            const b = h('button', { class: 'list-item' }, h('i', { class: 'dot', style: `background:${teamColor(p.team)}` }), h('span', { text: p.callsign || p.name }), h('small', { text: p.unit ? p.unit.status : p.team }));
            b.addEventListener('click', () => { selected = { kind: 'player', key: p.name }; const a = pos(p.x, p.z); if (a) map.flyTo(a.u, a.v); draw(); renderInfo(); });
            return b;
          }), units.length ? null : empty('No emergency units in the server.'))));
      }
    }

    const calibrating = () => Boolean(pick && pick.type === 'calibrate');
    function toggleCal() {
      if (calibrating()) {
        pick = null;
        calPoints.length = 0;
        map.setPick(false);
      } else {
        pick = { type: 'calibrate', player: null };
        map.setPick(true);
      }
      renderSide();
      draw();
    }
    function calPanel() {
      const sel = h('select', {}, h('option', { value: '', text: 'Choose a player...' }), data.players.filter((p) => p.x != null).map((p) => h('option', { value: p.name, text: `${p.name} (${Math.round(p.x)}, ${Math.round(p.z)})` })));
      sel.addEventListener('change', () => { pick.player = data.players.find((p) => p.name === sel.value) || null; toast(pick.player ? 'Now click where that player is on the map.' : 'Choose a player first.'); });
      const savebtn = h('button', { class: 'btn small primary', text: 'Save calibration', disabled: calPoints.length < 2 });
      savebtn.addEventListener('click', async () => {
        const out = await act(savebtn, () => api('POST', '/api/cad/map/calibrate', { points: calPoints.map((p) => ({ x: p.x, z: p.z, u: p.u, v: p.v })) }), 'Calibration saved.');
        if (out) { calPoints.length = 0; pick = null; map.setPick(false); refresh(); }
      });
      return h('div', { class: 'card flat' }, h('h3', { text: 'Calibrate' }),
        h('p', { class: 'muted', text: 'Pick a player who is standing somewhere recognisable, then click that exact spot on the map. Do this for at least two spots that are far apart (opposite corners is best), then save.' }),
        sel, h('div', { class: 'row' }, savebtn, h('span', { class: 'hint', text: `${calPoints.length} point(s)` })));
    }

    function toggle(label, on, set, color) {
      const cb = h('input', { type: 'checkbox' });
      cb.checked = Boolean(on);
      cb.addEventListener('change', () => set(cb.checked));
      return h('label', { class: 'tg' }, cb, color ? h('i', { class: 'dot', style: `background:${color}` }) : null, h('span', { text: label }));
    }

    async function refresh() {
      try {
        data = await api('GET', '/api/cad/map');
        banner.querySelectorAll('.err').forEach((n) => n.remove());
      } catch (e) {
        if (!data) banner.append(h('div', { class: 'notice err', text: e.message }));
        return;
      }
      renderSide();
      draw();
      renderInfo();
    }

    el.append(head('Live map', 'Units, civilians and 911 calls from the game, refreshed every 10 seconds.'), banner,
      h('div', { class: 'map-layout' }, map.wrap, h('div', { class: 'map-right' }, infoBox, side)));
    await refresh();
    live(el, refresh, 10_000);
  };

  // ======================================================================
  // Calls and dispatch
  // ======================================================================
  function callCard(c, after, compact) {
    const [pl, pc] = PRIO[c.priority] || PRIO[2];
    const mine = me.shift ? c.units.some((u) => u.shiftId === me.shift.id) : false;
    const card = h('div', { class: 'card flat call' },
      h('div', { class: 'row' }, h('b', { text: `#${c.id} ${c.title}` }), h('span', { class: `badge ${pc}`, text: pl }), h('span', { class: `badge ${c.status === 'Active' ? 'blue' : ''}`, text: c.status }), c.team ? h('span', { class: 'badge', text: c.team }) : null),
      h('p', { class: 'muted', text: `${ago(c.createdAt)}${c.location ? ` - ${c.location}` : ''}` }),
      c.description ? h('p', { text: c.description }) : null,
      c.units.length ? h('div', { class: 'row' }, c.units.map((u) => h('span', { class: 'badge ok', text: u.callsign || u.name }))) : h('p', { class: 'hint', text: 'No units attached.' }),
      c.notes.length && !compact ? h('div', { class: 'notes' }, c.notes.map((n) => h('div', { class: 'hint', text: `${n.author}: ${n.text}` }))) : null);
    const run = (b, path, body, msg) => b.addEventListener('click', async () => { if (await act(b, () => api('POST', `/api/cad/calls/${c.id}/${path}`, body || {}), msg)) after(); });
    const row = h('div', { class: 'row' });
    if (me.shift) {
      const b = h('button', { class: `btn small ${mine ? '' : 'primary'}`, text: mine ? 'Detach' : 'Attach me' });
      run(b, mine ? 'detach' : 'attach', {}, mine ? 'Detached.' : 'Attached.');
      row.append(b);
    }
    const note = h('button', { class: 'btn small', text: 'Add note' });
    note.addEventListener('click', () => modal({ title: `Note on call #${c.id}`, fields: [{ name: 'text', label: 'Note', long: true }], onSubmit: async (v) => { await api('POST', `/api/cad/calls/${c.id}/note`, { text: v.text }); after(); } }));
    const prio = h('button', { class: 'btn small', text: 'Priority' });
    prio.addEventListener('click', () => modal({ title: 'Priority', fields: [{ name: 'priority', label: 'Priority', options: [['1', 'Low'], ['2', 'Medium'], ['3', 'High']] }], onSubmit: async (v) => { await api('POST', `/api/cad/calls/${c.id}/priority`, { priority: Number(v.priority) }); after(); } }));
    const close = h('button', { class: 'btn small danger', text: 'Close' });
    close.addEventListener('click', () => modal({ title: `Close call #${c.id}`, fields: [{ name: 'disposition', label: 'Disposition', placeholder: 'For example Report taken' }], confirm: 'Close call', danger: true, onSubmit: async (v) => { await api('POST', `/api/cad/calls/${c.id}/close`, { disposition: v.disposition }); toast('Call closed.'); after(); } }));
    row.append(note, prio, close);
    card.append(row);
    return card;
  }

  views.dispatch = async (el) => {
    me = await api('GET', '/api/cad/me');
    const root = h('div', {});
    el.append(root);
    async function load() {
      const d = await api('GET', '/api/cad/board');
      const newCall = h('button', { class: 'btn primary', text: 'New call' });
      newCall.addEventListener('click', () => modal({
        title: 'New call',
        fields: [{ name: 'title', label: 'Type of call', max: 80 }, { name: 'location', label: 'Location', max: 200 }, { name: 'description', label: 'Details', long: true }, { name: 'priority', label: 'Priority', options: [['1', 'Low'], ['2', 'Medium'], ['3', 'High']] }],
        confirm: 'Create call',
        onSubmit: async (v) => { await api('POST', '/api/cad/calls', { title: v.title, location: v.location, description: v.description, priority: Number(v.priority || 2) }); load(); },
      }));
      const unitRows = d.units.map((u) => {
        const attach = h('span', { class: 'badge ' + statusClass(u.status), text: u.status });
        return [h('b', { text: u.callsign || '-' }), u.name, dn(u.department), attach, ago(u.startedAt)];
      });
      root.replaceChildren(
        head('Dispatch', 'Open calls and units on duty. In-game 911 calls appear here automatically.', newCall),
        h('div', { class: 'dispatch' },
          h('div', {}, h('h3', { class: 'section', text: `Open calls (${d.calls.length})` }), d.calls.length ? d.calls.map((c) => callCard(c, load)) : empty('No open calls.')),
          h('div', {},
            h('h3', { class: 'section', text: `Units on duty (${d.units.length})` }), table(['Callsign', 'Name', 'Department', 'Status', 'On since'], unitRows, 'Nobody is on duty.'),
            h('h3', { class: 'section', text: 'BOLOs' }), bolos(d.bolos, load))));
    }
    function bolos(list, reload) {
      const wrap = h('div', {});
      if (me.isLaw) {
        const add = h('button', { class: 'btn small', text: 'New BOLO' });
        add.addEventListener('click', () => modal({ title: 'New BOLO', fields: [{ name: 'kind', label: 'Type', options: [['Person', 'Person'], ['Vehicle', 'Vehicle']] }, { name: 'subject', label: 'Who or what', max: 100 }, { name: 'details', label: 'Details', long: true }], onSubmit: async (v) => { await api('POST', '/api/cad/bolos', v); reload(); } }));
        wrap.append(add);
      }
      if (!list.length) wrap.append(empty('No active BOLOs.'));
      for (const b of list) {
        const clear = h('button', { class: 'btn small', text: 'Clear' });
        clear.addEventListener('click', async () => { if (await act(clear, () => api('POST', `/api/cad/bolos/${b.id}/clear`, {}))) reload(); });
        wrap.append(h('div', { class: 'card flat' }, h('div', { class: 'row' }, h('span', { class: 'badge bad', text: b.kind }), h('b', { text: b.subject })), b.details ? h('p', { class: 'muted', text: b.details }) : null, h('p', { class: 'hint', text: `${b.issuer_name}, ${ago(b.created_at)}` }), me.isLaw ? clear : null));
      }
      return wrap;
    }
    await load();
    live(root, () => load().catch(() => {}), 8000);
  };

  // ======================================================================
  // Records
  // ======================================================================
  views.records = async (el) => {
    me = await api('GET', '/api/cad/me');
    const out = h('div', {});
    const q = h('input', { placeholder: 'Search a name, record number or plate', maxlength: 60 });
    const go = h('button', { class: 'btn primary', text: 'Search' });
    const create = h('button', { class: 'btn', text: 'New record' });
    create.addEventListener('click', () => modal({
      title: 'New civilian record',
      fields: [{ name: 'firstName', label: 'First name', max: 40 }, { name: 'lastName', label: 'Last name', max: 40 }, { name: 'dob', label: 'Date of birth', placeholder: 'MM/DD/YYYY', max: 20 }, { name: 'gender', label: 'Gender', max: 20 }, { name: 'address', label: 'Address', max: 120 }],
      onSubmit: async (v) => { const r = await api('POST', '/api/cad/records/characters', v); open(r.id); },
    }));
    async function search() {
      if (q.value.trim().length < 2) return toast('Type at least 2 characters.', 'bad');
      const r = await act(go, () => api('GET', `/api/cad/records/search?q=${encodeURIComponent(q.value.trim())}`));
      if (!r) return;
      out.replaceChildren();
      P.put(out,
        r.people.length || r.vehicles.length ? null : empty('No matches.'),
        r.people.length ? table(['#', 'Name', 'Date of birth', 'License', 'Warrants'], r.people.map((p) => [String(p.id), h('a', { href: '#', class: 'link', text: `${p.first_name} ${p.last_name}`, onclick: (e) => { e.preventDefault(); open(p.id); } }), p.dob || '', p.license, p.warrants ? h('span', { class: 'badge bad', text: `${p.warrants} active` }) : '0']), '') : null,
        r.vehicles.length ? table(['Plate', 'Vehicle', 'Status', 'Owner'], r.vehicles.map((v) => [h('b', { text: v.plate }), `${v.color || ''} ${v.model || ''}`.trim(), h('span', { class: `badge ${v.status === 'Valid' ? 'ok' : 'bad'}`, text: v.status }), h('a', { href: '#', class: 'link', text: `${v.first_name} ${v.last_name}`, onclick: (e) => { e.preventDefault(); open(v.character_id); } })]), '') : null);
    }
    go.addEventListener('click', search);
    q.addEventListener('keydown', (e) => e.key === 'Enter' && search());

    async function open(id) {
      const d = await api('GET', `/api/cad/records/characters/${id}`);
      const c = d.character;
      const wrap = h('div', {});
      const back = h('button', { class: 'btn small', text: 'Back to search', onclick: () => out.replaceChildren() });
      const active = d.warrants.filter((w) => w.status === 'Active');
      P.put(wrap,
        back,
        active.length ? h('div', { class: 'notice', text: `${active.length} ACTIVE WARRANT(S). Use caution.` }) : null,
        h('div', { class: 'card' }, h('h3', { text: `${c.first_name} ${c.last_name}` }),
          h('div', { class: 'kv' }, kv('Record #', String(c.id)), kv('Date of birth', c.dob || '-'), kv('Gender', c.gender || '-'), kv('Address', c.address || '-'), kv('License', c.license)),
          c.notes ? h('p', { class: 'muted', text: c.notes }) : null,
          me.isLaw ? h('div', { class: 'row' }, h('button', { class: 'btn small', text: 'Set license', onclick: () => modal({ title: 'License status', fields: [{ name: 'license', label: 'Status', options: [['Valid', 'Valid'], ['Suspended', 'Suspended'], ['Revoked', 'Revoked'], ['Expired', 'Expired']] }], onSubmit: async (v) => { await api('POST', `/api/cad/records/characters/${id}/update`, v); open(id); } }) })) : null),
        h('h3', { class: 'section', text: 'Vehicles' }),
        table(['Plate', 'Vehicle', 'Status'], d.vehicles.map((v) => [h('b', { text: v.plate }), `${v.color || ''} ${v.model || ''}`.trim(), vehStatus(v, id)]), 'No vehicles.'),
        h('div', { class: 'row' }, h('button', { class: 'btn small', text: 'Add vehicle', onclick: () => modal({ title: 'Add vehicle', fields: [{ name: 'plate', label: 'Plate', max: 10 }, { name: 'model', label: 'Model', max: 40 }, { name: 'color', label: 'Color', max: 20 }], onSubmit: async (v) => { await api('POST', `/api/cad/records/characters/${id}/vehicles`, v); open(id); } }) })),
        h('h3', { class: 'section', text: 'Warrants' }),
        table(['Date', 'Type', 'Reason', 'Issued by', 'Status'], d.warrants.map((w) => [dt(w.created_at), w.kind, w.reason, w.issuer_name || '', w.status === 'Active' && me.isLaw ? h('button', { class: 'btn small', text: 'Close', onclick: async (e) => { if (await act(e.target, () => api('POST', `/api/cad/records/warrants/${w.id}/close`, {}))) open(id); } }) : h('span', { class: `badge ${w.status === 'Active' ? 'bad' : ''}`, text: w.status })]), 'No warrants.'),
        me.isLaw ? h('div', { class: 'row' }, h('button', { class: 'btn small danger', text: 'Issue warrant', onclick: () => modal({ title: 'Issue warrant', danger: true, fields: [{ name: 'kind', label: 'Type', options: [['Arrest', 'Arrest'], ['Search', 'Search'], ['Bench', 'Bench']] }, { name: 'reason', label: 'Reason', long: true }], onSubmit: async (v) => { await api('POST', `/api/cad/records/characters/${id}/warrants`, v); open(id); } }) })) : null,
        h('h3', { class: 'section', text: 'Citations and arrests' }),
        table(['Date', 'Type', 'Charges', 'Fine', 'Officer'], d.citations.map((x) => [dt(x.created_at), x.kind, x.charges, x.fine != null ? `$${x.fine}` : '', x.issuer_name || '']), 'None on file.'),
        me.isLaw ? h('div', { class: 'row' }, h('button', { class: 'btn small', text: 'Add citation or arrest', onclick: () => modal({ title: 'Add to record', fields: [{ name: 'kind', label: 'Type', options: [['Citation', 'Citation'], ['Warning', 'Warning'], ['Arrest', 'Arrest']] }, { name: 'charges', label: 'Charges', long: true }, { name: 'fine', label: 'Fine (optional)', max: 8 }, { name: 'notes', label: 'Notes', long: true }], onSubmit: async (v) => { await api('POST', `/api/cad/records/characters/${id}/citations`, v); open(id); } }) })) : null);
      out.replaceChildren(wrap);
    }
    const kv = (k, v) => h('div', {}, h('small', { text: k }), h('b', { text: v }));
    const vehStatus = (v, id) => (me.isLaw
      ? h('button', { class: `btn small ${v.status === 'Valid' ? '' : 'danger'}`, text: v.status, onclick: () => modal({ title: `Plate ${v.plate}`, fields: [{ name: 'status', label: 'Status', options: [['Valid', 'Valid'], ['Stolen', 'Stolen'], ['Suspended', 'Suspended'], ['Impounded', 'Impounded']] }], onSubmit: async (x) => { await api('POST', `/api/cad/records/vehicles/${v.id}/status`, x); open(id); } }) })
      : h('span', { class: `badge ${v.status === 'Valid' ? 'ok' : 'bad'}`, text: v.status }));

    el.append(head('Records', 'Civilian records, vehicles, warrants and citations.', create), h('div', { class: 'row search' }, q, go), out);
  };

  // ======================================================================
  // Supervisor roster
  // ======================================================================
  views.roster = async (el) => {
    me = await api('GET', '/api/cad/me');
    if (!me.supervisorOf.length) return el.append(empty('Only supervisors can see this.'));
    const wanted = new URLSearchParams(location.hash.split('?')[1] || '').get('d');
    const dept = me.supervisorOf.includes(wanted) ? wanted : me.supervisorOf[0];
    const sel = h('select', {}, me.supervisorOf.map((d) => h('option', { value: d, text: dn(d), selected: d === dept })));
    sel.addEventListener('change', () => { location.hash = `#/roster?d=${sel.value}`; });

    const [r, pend] = await Promise.all([api('GET', `/api/cad/roster/${dept}`), api('GET', '/api/cad/pending')]);
    const act2 = (m, type) => modal({
      title: `${type[0].toUpperCase()}${type.slice(1)}: ${m.name}`,
      sub: type === 'termination' ? 'This removes their department role and cannot be undone from here.' : 'The member is told by direct message and it is logged.',
      danger: type === 'termination' || type === 'strike', confirm: 'Issue',
      fields: [{ name: 'reason', label: 'Reason', long: true }],
      onSubmit: async (v) => { await api('POST', '/api/cad/discipline', { department: dept, discordId: m.id, type, reason: v.reason }); toast('Issued.'); views.roster(el.replaceChildren() || el); },
    });
    const showHistory = async (m) => {
      const d = await api('GET', `/api/cad/discipline/${dept}?member=${m.id}`);
      const rows = d.actions;
      const box = h('div', { class: 'overlay', onclick: (e) => e.target === box && box.remove() },
        h('div', { class: 'modal wide' }, h('h3', { text: `History: ${m.name}` }),
          table(['Date', 'Type', 'Reason', 'By', 'Status', ''], rows.map((a) => [dt(a.created_at), a.type, h('span', { class: 'muted', text: a.reason }), a.issuer_name || '', a.status,
            ['active', 'pending'].includes(a.status) ? h('button', { class: 'btn small', text: 'Revoke', onclick: async (e) => { if (await act(e.target, () => api('POST', `/api/cad/discipline/${a.id}/revoke`, {}), 'Revoked.')) { box.remove(); views.roster(el.replaceChildren() || el); } } }) : ''
          ]), 'Clean record.'),
          h('div', { class: 'row end' }, h('button', { class: 'btn', text: 'Close', onclick: () => box.remove() }))));
      document.body.append(box);
    };

    const rows = r.members.map((m) => [
      h('div', {}, h('b', { text: m.name }), m.exempt ? h('small', { class: 'hint', text: ' exempt' }) : null),
      m.onDuty ? h('span', { class: 'badge ok', text: `On duty ${m.callsign || ''}` }) : h('span', { class: 'badge', text: 'Off duty' }),
      h('div', { class: 'quota-cell' }, h('span', { text: mins(m.weekSeconds) }), bar(m.weekSeconds, r.quotaMinutes * 60, m.met ? 'ok' : '')),
      m.lastWeek ? h('span', { class: `badge ${m.lastWeek.met ? 'ok' : 'bad'}`, text: `${mins(m.lastWeek.seconds)}` }) : h('span', { class: 'muted', text: '-' }),
      h('span', { text: `${m.warnings} / ${m.strikes} / ${m.infractions}${m.pending ? ' (termination pending)' : ''}` }),
      h('div', { class: 'row tight' },
        ...['warning', 'strike', 'infraction', 'termination'].map((t) => h('button', { class: `btn small ${t === 'termination' ? 'danger' : ''}`, text: t === 'termination' ? 'Terminate' : t === 'infraction' ? 'Infract' : t[0].toUpperCase() + t.slice(1), onclick: () => act2(m, t) })),
        h('button', { class: 'btn small', text: 'History', onclick: () => showHistory(m) })),
    ]);

    el.append(head('Roster', `${r.name}. Quota: ${r.quotaApplies ? `${r.quotaMinutes} minutes a week` : 'not enforced for this department'}.`, sel));
    if (pend.pending.length) {
      el.append(h('div', { class: 'card flat' }, h('h3', { text: 'Terminations waiting for review' }),
        pend.pending.map((p) => h('div', { class: 'row pending' }, h('b', { text: p.name }), h('span', { class: 'muted', text: `${dn(p.department)}: ${p.reason}` }),
          h('button', { class: 'btn small danger', text: 'Confirm termination', onclick: async (e) => { if (await act(e.target, () => api('POST', `/api/cad/discipline/${p.id}/confirm`, {}), 'Termination confirmed.')) views.roster(el.replaceChildren() || el); } }),
          h('button', { class: 'btn small', text: 'Dismiss', onclick: async (e) => { if (await act(e.target, () => api('POST', `/api/cad/discipline/${p.id}/revoke`, {}), 'Dismissed.')) views.roster(el.replaceChildren() || el); } })))));
    }
    el.append(table(['Member', 'Status', 'This week', 'Last week', 'Warn / Strike / Infract', 'Actions'], rows, 'Nobody has this department role.'));
  };
})();
