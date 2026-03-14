// ============================================================
//  ABYSSAL OS — Hub  v2.0
//
//  Load order: login.js → hub.js → script.js
//
//  Integration notes:
//  • Uses window.openWindow() from script.js for all window ops
//    (handles tab creation, z-index, placement automatically)
//  • Does NOT create its own taskbar tabs or bringToFront —
//    script.js's initWindows / ensureTab owns that
//  • window.generateWebMap exposed by script.js patch
//  • window.openTerminal, window.openOpsecConsole from script.js
// ============================================================

(function () {
  'use strict';

  // ── Storage ──────────────────────────────────────────────────
  const HUB_KEY  = 'abyssal_hub_v2';
  const RAIN_KEY = 'abyssal_rain';

  // ── Hub state ────────────────────────────────────────────────
  let hub = {
    firstBoot:        true,
    contractAccepted: false,
    sectorUnlocked:   false,
    stashVisited:     false,
    toolPool:         [],     // tool ids the player owns
    loadout:          [],     // equipped tool ids (max per tier)
    messages:         [],     // { id, from, subj, body, attachments[], read, ts }
    rainOn:           false,
  };

  // ── Constants ────────────────────────────────────────────────
  const STASH_TOOLS      = ['nmap_scan', 'default_login', 'dict_attack', 'pastebin_exploit', 'pkt_sniffer'];
  const STASH_PICK_LIMIT = 2;
  const LOADOUT_SLOTS    = { 0: 8, 1: 10, 2: 12, 3: 14 };

  // ── Icon definitions ─────────────────────────────────────────
  // app: the window id OR a special handler key
  const ICONS = [
    { id: 'di-terminal', label: 'TERMINAL.sh',       glyph: '>_', app: 'win-terminal',  always: true  },
    { id: 'di-messages', label: 'MESSAGES.app',      glyph: '✉',  app: 'win-messages',  always: true  },
    { id: 'di-loadout',  label: 'LOADOUT.sys',       glyph: '⚙',  app: 'win-loadout',   always: true  },
    { id: 'di-opsec',    label: 'OPSEC.exe',         glyph: '🛡', app: 'win-opsec',     always: true  },
    { id: 'di-servers',  label: 'SERVERS.dat',       glyph: '⬡',  app: 'win-servers',   always: true  },
    { id: 'di-nettopo',  label: 'NET_TOPO.exe',      glyph: '⊞',  app: 'win-map',       always: false }, // unlocks on contract
    { id: 'di-stash',    label: 'FRIEND_STASH.lnk',  glyph: '★',  app: 'win-stash',     always: false }, // one-time
  ];

  // ── Boot entry (called by login.js after auth) ───────────────
  window.bootIntoDesktop = function (profile) {
    if (profile && profile.id && typeof window.setSysName === 'function') {
      window.setSysName(profile.id);
    }
    loadHub();
    buildIcons();
    initRain();
    if (hub.firstBoot) {
      setTimeout(firstBoot, 1400);
    } else {
      restoreHub();
    }
  };

  // Expose launchSector for icon click and loadout button
  window.launchSector = function () {
    if (!hub.sectorUnlocked) return;
    if (typeof window.generateWebMap === 'function') window.generateWebMap();
    openWin('win-map');
  };

  // ── Persist ──────────────────────────────────────────────────
  function saveHub () { try { localStorage.setItem(HUB_KEY, JSON.stringify(hub)); } catch (_) {} }
  function loadHub () {
    try { const r = localStorage.getItem(HUB_KEY); if (r) Object.assign(hub, JSON.parse(r)); }
    catch (_) {}
    hub.rainOn = localStorage.getItem(RAIN_KEY) === 'true';
  }

  // ── Open window via script.js system ─────────────────────────
  function openWin (id) {
    // script.js exposes openWindow globally after DOMContentLoaded.
    // hub.js loads before that, so we guard with a small retry.
    if (typeof window.openWindow === 'function') {
      window.openWindow(id);
    } else {
      setTimeout(() => openWin(id), 150);
    }
  }

  // ── Desktop Icons ────────────────────────────────────────────
  function buildIcons () {
    const wrap = document.getElementById('desktop-icons');
    if (!wrap) return;

    // Remove hub-managed icons only (leave any script.js icons alone)
    wrap.querySelectorAll('.desk-icon').forEach(el => el.remove());

    ICONS.forEach(def => {
      // Visibility rules
      if (def.id === 'di-nettopo' && !hub.sectorUnlocked) {
        // Show greyed-out placeholder so player knows it exists
      }
      if (def.id === 'di-stash' && (hub.stashVisited || !hub.contractAccepted)) return;

      const locked = def.id === 'di-nettopo' && !hub.sectorUnlocked;

      const el = document.createElement('div');
      el.className = 'desk-icon' + (locked ? ' desk-icon-locked' : '');
      el.id = def.id;
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', locked ? '-1' : '0');
      el.setAttribute('aria-label', locked ? `${def.label} (locked)` : def.label);
      el.innerHTML = `
        <div class="di-glyph">${def.glyph}</div>
        <div class="di-label">${def.label}</div>
        <div class="di-badge hidden" id="${def.id}-badge">1</div>`;

      if (!locked) {
        el.addEventListener('click',   () => iconClick(def));
        el.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); iconClick(def); }
        });
      }
      wrap.appendChild(el);
    });
  }

  function iconClick (def) {
    switch (def.id) {
      case 'di-terminal': openTerminal();              return;
      case 'di-messages': openMessages();              return;
      case 'di-loadout':  openLoadout();               return;
      case 'di-opsec':    openOpsec();                 return;
      case 'di-servers':  openWin('win-servers');      return;
      case 'di-nettopo':  window.launchSector?.();     return;
      case 'di-stash':    openStash();                 return;
    }
  }

  function openTerminal () {
    // Use script.js's openTerminal which also boots the terminal content
    if (typeof window.openTerminal === 'function') window.openTerminal();
    else openWin('win-terminal');
  }

  function openOpsec () {
    // Use script.js's openOpsecConsole which builds the OPSEC content
    if (typeof window.openOpsecConsole === 'function') window.openOpsecConsole();
    else openWin('win-opsec');
  }

  function setBadge (iconId, count) {
    const badge = document.getElementById(`${iconId}-badge`);
    if (!badge) return;
    if (count > 0) { badge.textContent = count; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  }

  function pulseIcon (iconId) {
    const el = document.getElementById(iconId);
    if (!el) return;
    el.classList.remove('desk-icon-pulse');
    void el.offsetWidth;
    el.classList.add('desk-icon-pulse');
    setTimeout(() => el.classList.remove('desk-icon-pulse'), 3600);
  }

  // ── First boot ───────────────────────────────────────────────
  function firstBoot () {
    hub.firstBoot = false;
    deliverMsg({
      id:   'msg_intro',
      from: '░░░░░@░░░░░░░.░░░',
      subj: 'you came recommended',
      body:
`don't ask who told me about you.
don't ask what this is for.

there's a sector that needs quiet work.
PHARMA-CORP. medical division.
they have something i need.

attached: starter kit. handle with care.
more tools available if you can find them.

prove you're worth the recommendation.
coordinates will follow once you're ready.

— ░░░`,
      attachments: [
        { type: 'tool', id: 'bit_shift',     label: 'bit_shift.tool'     },
        { type: 'tool', id: 'port_scan',     label: 'port_scan.tool'     },
        { type: 'tool', id: 'phishing_link', label: 'phishing_link.tool' },
        { type: 'link', id: 'stash',         label: 'FRIEND_STASH.lnk'  },
      ],
      ts: Date.now(),
    });
    setBadge('di-messages', 1);
    setTimeout(() => openMessages(), 600);
    saveHub();
  }

  function restoreHub () {
    setBadge('di-messages', hub.messages.filter(m => !m.read).length);
  }

  // ── Mid-tutorial drops (called from script.js breachSuccess) ─
  window.hubOnNodeCleared = function (nodeIndex, totalNodes) {
    if (!hub.contractAccepted) return;
    const drops = [
      { idx: 0,              id: 'brute_force',  subj: 're: sector update',
        body: `you made it past the first one.\n\nhere.` },
      { idx: 1,              id: 'pkt_sniffer',  subj: 're:',
        body: `you're getting the hang of it.` },
      { idx: totalNodes - 1, id: 'default_login',subj: 'sector clean',
        body: `sector's clean.\n\nkeep the tools. you'll need them.\n\ni'll be in touch.\n\n— ░░░` },
    ];
    const drop = drops.find(d => d.idx === nodeIndex);
    if (!drop) return;
    deliverMsg({
      id:          `msg_drop_${drop.id}`,
      from:        '░░░░░@░░░░░░░.░░░',
      subj:        drop.subj,
      body:        drop.body,
      attachments: [{ type: 'tool', id: drop.id, label: `${drop.id}.tool` }],
      ts:          Date.now(),
    });
    setBadge('di-messages', hub.messages.filter(m => !m.read).length);
    hubToast('[NEW MESSAGE] — 1 unread');
    saveHub();
  };

  // ── Messages ─────────────────────────────────────────────────
  function deliverMsg (msg) {
    if (hub.messages.find(m => m.id === msg.id)) return;
    hub.messages.unshift(msg);
  }

  function openMessages () {
    buildMsgList();
    openWin('win-messages');
    hub.messages.forEach(m => m.read = true);
    setBadge('di-messages', 0);
    saveHub();
  }

  function buildMsgList () {
    const el = document.getElementById('win-messages-content');
    if (!el) return;

    if (!hub.messages.length) {
      el.innerHTML = '<div class="msg-empty">// no messages</div>';
      return;
    }

    el.innerHTML = '';
    hub.messages.forEach(msg => {
      const row = document.createElement('div');
      row.className = 'msg-item' + (msg.read ? '' : ' msg-unread');
      row.innerHTML = `
        <div class="msg-header">
          <span class="msg-from">${esc(msg.from)}</span>
          <span class="msg-subj">${esc(msg.subj)}</span>
          <span class="msg-ts">${fmtTs(msg.ts)}</span>
        </div>`;
      row.addEventListener('click', () => buildMsgDetail(msg));
      el.appendChild(row);
    });
  }

  function buildMsgDetail (msg) {
    const el = document.getElementById('win-messages-content');
    if (!el) return;

    const attachHtml = (msg.attachments || []).map(att => {
      if (att.type === 'tool') {
        const owned = hub.toolPool.includes(att.id);
        return `<button class="msg-attach${owned ? ' msg-attach-owned' : ''}"
                  data-id="${att.id}" data-type="tool"
                  ${owned ? 'disabled' : ''}>
                  📎 ${esc(att.label)} ${owned ? '(installed)' : '[ OPEN ]'}
                </button>`;
      }
      if (att.type === 'link' && att.id === 'stash') {
        const used = hub.stashVisited;
        return `<button class="msg-attach msg-attach-link${used ? ' msg-attach-owned' : ''}"
                  data-id="stash" data-type="link"
                  ${used ? 'disabled' : ''}>
                  🔗 ${esc(att.label)} ${used ? '(visited)' : '[ VISIT ]'}
                </button>`;
      }
      return '';
    }).join('');

    // Show accept button only for intro message once player has ≥3 tools
    const canAccept = msg.id === 'msg_intro'
      && !hub.contractAccepted
      && hub.toolPool.length >= 3;

    el.innerHTML = `
      <button class="msg-back" id="msg-back">← BACK</button>
      <div class="msg-detail">
        <div class="msg-detail-meta">FROM: ${esc(msg.from)}</div>
        <div class="msg-detail-meta">SUBJ: ${esc(msg.subj)}</div>
        <pre class="msg-body">${esc(msg.body)}</pre>
        ${attachHtml ? `<div class="msg-attachments">${attachHtml}</div>` : ''}
        ${canAccept ? `<button class="msg-accept" id="msg-accept">[ ACCEPT CONTRACT → ]</button>` : ''}
      </div>`;

    el.querySelector('#msg-back')?.addEventListener('click', buildMsgList);

    el.querySelectorAll('.msg-attach:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => onAttach(btn, msg));
    });

    el.querySelector('#msg-accept')?.addEventListener('click', () => acceptContract(msg));
  }

  function onAttach (btn, msg) {
    const { id, type } = btn.dataset;
    if (type === 'tool') {
      if (hub.toolPool.includes(id)) return;
      hub.toolPool.push(id);
      btn.textContent = `📎 ${id}.tool (installed)`;
      btn.disabled = true;
      btn.classList.add('msg-attach-owned');
      const tdb = window.TOOL_DB || {};
      const name = tdb[id]?.name || id;
      hubToast(`📦 ${name} added to tool pool`);
      saveHub();
      buildMsgDetail(msg); // re-render to show accept button if threshold met
    }
    if (type === 'link' && id === 'stash') openStash();
  }

  function acceptContract (msg) {
    hub.contractAccepted = true;
    hub.sectorUnlocked   = true;
    saveHub();

    const el = document.getElementById('win-messages-content');
    if (!el) return;
    el.innerHTML = `
      <div class="msg-reply-wrap">
        <pre class="msg-body">[SENT]\ni'm ready.</pre>
        <pre class="msg-body msg-reply-in" id="msg-reply-in"></pre>
      </div>`;

    const replyEl = document.getElementById('msg-reply-in');
    typeInto(replyEl,
`[REPLY — RECEIVED]
coordinates attached.
don't get caught.
good luck.

— ░░░`, 36, () => {
      setTimeout(() => {
        buildMsgList();
        buildIcons(); // show NET_TOPO and STASH icons
        pulseIcon('di-nettopo');
        hubToast('SECTOR COORDINATES RECEIVED — NET_TOPO.exe unlocked');
      }, 1200);
    });
  }

  // ── Friend Stash ─────────────────────────────────────────────
  function openStash () {
    buildStash();
    openWin('win-stash');
  }

  function buildStash () {
    const el = document.getElementById('win-stash-content');
    if (!el) return;

    if (hub.stashVisited) {
      el.innerHTML = `<div class="stash-page">
        <pre class="stash-gone">404 Not Found

the server you are looking for
is no longer here.

connection closed.</pre></div>`;
      return;
    }

    const picks    = hub._stashPicks || [];
    const canPick  = picks.length < STASH_PICK_LIMIT;
    const avail    = STASH_TOOLS.filter(id => !hub.toolPool.includes(id));
    const tdb      = window.TOOL_DB || {};

    const rows = avail.map(id => {
      const t      = tdb[id];
      if (!t) return '';
      const picked = picks.includes(id);
      return `<tr class="stash-tr${picked ? ' stash-picked' : ''}">
        <td class="stash-icon">${t.icon}</td>
        <td class="stash-name">${esc(t.name)}</td>
        <td class="stash-desc">${esc(t.desc)}</td>
        <td><a href="#" class="stash-dl${picked ? ' stash-dl-done' : canPick ? '' : ' stash-dl-disabled'}"
               data-id="${id}">${picked ? '[DOWNLOADED]' : '[DOWNLOAD]'}</a></td>
      </tr>`;
    }).join('');

    el.innerHTML = `
      <div class="stash-page">
        <div class="stash-marquee-wrap">
          <div class="stash-marquee">★ WELCOME TO MY PAGE ★ &nbsp;&nbsp; TOOLS 4 U &nbsp;&nbsp; ★ WELCOME TO MY PAGE ★ &nbsp;&nbsp; TOOLS 4 U &nbsp;&nbsp;</div>
        </div>
        <div class="stash-header">
          <span class="stash-rainbow">
            <span>T</span><span>O</span><span>O</span><span>L</span><span>S</span>
            &nbsp;<span>4</span>&nbsp;<span>U</span>
          </span>
          <div class="stash-tagline">a friend's personal software archive</div>
        </div>
        <div class="stash-uc"><span class="stash-blink">▓▓▓</span> UNDER CONSTRUCTION <span class="stash-blink">▓▓▓</span></div>
        <div class="stash-about">
          <p class="stash-txt">hey welcome 2 my page !! these r some tools i wrote or found<br>take what u need, leave the rest<br>dont tell anyone where u got these lol</p>
          <p class="stash-sub">last updated: 2003-11-14</p>
          <p class="stash-sub stash-orange">BEST VIEWED IN NETSCAPE NAVIGATOR 4.0 AT 800×600</p>
        </div>
        <div class="stash-divider">— ✦ DOWNLOADS ✦ —</div>
        <p class="stash-picks">pick up to ${STASH_PICK_LIMIT} &nbsp;·&nbsp; <span>${STASH_PICK_LIMIT - picks.length} remaining</span></p>
        <table class="stash-table">
          <thead><tr><th></th><th>NAME</th><th>DESCRIPTION</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="stash-footer">
          <div class="stash-hits">you are visitor #<span>000${Math.floor(Math.random()*900+100)}</span></div>
          <a href="#" class="stash-gb" id="stash-gb">sign my guestbook!!</a>
          <span class="stash-email">email me: <span style="color:#00ffff">friend@localhost</span></span>
        </div>
        ${picks.length >= STASH_PICK_LIMIT
          ? `<div style="text-align:center;margin-top:12px">
               <button class="stash-done" id="stash-done">CLOSE STASH ✕</button>
             </div>` : ''}
      </div>`;

    el.querySelectorAll('.stash-dl:not(.stash-dl-done):not(.stash-dl-disabled)').forEach(a => {
      a.addEventListener('click', e => { e.preventDefault(); stashDownload(a.dataset.id); });
    });
    el.querySelector('#stash-gb')?.addEventListener('click', e => {
      e.preventDefault();
      const out = document.getElementById('terminal-output');
      if (out) {
        const line = document.createElement('span');
        line.className = 't-line t-error';
        line.textContent = 'guestbook: command not found';
        out.appendChild(line);
      }
      openTerminal();
    });
    el.querySelector('#stash-done')?.addEventListener('click', closeStash);
  }

  function stashDownload (id) {
    if (!hub._stashPicks) hub._stashPicks = [];
    if (hub._stashPicks.length >= STASH_PICK_LIMIT || hub._stashPicks.includes(id)) return;
    hub._stashPicks.push(id);
    if (!hub.toolPool.includes(id)) hub.toolPool.push(id);
    saveHub();
    const tdb  = window.TOOL_DB || {};
    hubToast(`📦 ${tdb[id]?.name || id} downloaded`);
    buildStash();
    if (hub._stashPicks.length >= STASH_PICK_LIMIT) hubToast('Stash limit reached — close when ready');
  }

  function closeStash () {
    hub.stashVisited = true;
    saveHub();
    // Close via script.js window system
    const win = document.getElementById('win-stash');
    if (win && typeof window.closeWindow === 'function') window.closeWindow('win-stash');
    else if (win) win.classList.add('hidden');
    buildIcons();
    // Re-open messages so player can now accept contract
    buildMsgList();
    openMessages();
  }

  // ── Loadout ───────────────────────────────────────────────────
  function openLoadout () {
    buildLoadout();
    openWin('win-loadout');
  }

  function buildLoadout () {
    const el = document.getElementById('win-loadout-content');
    if (!el) return;

    const tdb      = window.TOOL_DB || {};
    const tier     = (typeof state !== 'undefined') ? (state.tier || 0) : 0;
    const maxSlots = LOADOUT_SLOTS[tier] || 8;

    // Sync: remove tools no longer in pool
    hub.loadout = hub.loadout.filter(id => hub.toolPool.includes(id));

    const poolRows = hub.toolPool.map(id => {
      const t       = tdb[id];
      if (!t) return '';
      const equipped = hub.loadout.includes(id);
      return `<div class="lo-row${equipped ? ' lo-equipped' : ''}">
        <span class="lo-icon">${t.icon}</span>
        <span class="lo-name">${esc(t.name)}</span>
        <span class="lo-tier" style="color:${tierCol(t.tier)}">${tierLbl(t.tier)}</span>
        <span class="lo-phase">${t.phase || 'ANY'}</span>
        <button class="lo-btn" data-id="${id}">${equipped ? '[ REMOVE ]' : '[ EQUIP ]'}</button>
      </div>`;
    }).join('') || '<div class="lo-empty">No tools yet — collect from messages or the stash.</div>';

    const slotHtml = Array.from({ length: maxSlots }, (_, i) => {
      const id = hub.loadout[i];
      const t  = id ? tdb[id] : null;
      return `<div class="lo-slot${t ? ' lo-slot-full' : ''}">
        ${t
          ? `<span class="lo-slot-icon">${t.icon}</span><span class="lo-slot-name">${t.name}</span>`
          : `<span class="lo-slot-num">${i + 1}</span>`}
      </div>`;
    }).join('');

    const canLaunch = hub.sectorUnlocked && hub.loadout.length > 0;

    el.innerHTML = `
      <div class="lo-layout">
        <div class="lo-left">
          <div class="lo-title">TOOL POOL <span class="lo-ct">${hub.toolPool.length}</span></div>
          <div class="lo-pool">${poolRows}</div>
        </div>
        <div class="lo-right">
          <div class="lo-title">LOADOUT <span class="lo-ct">${hub.loadout.length} / ${maxSlots}</span></div>
          <div class="lo-slots">${slotHtml}</div>
          <p class="lo-hint">${
            hub.loadout.length === 0
              ? '// equip tools from the pool'
              : hub.sectorUnlocked
                ? '// loadout ready'
                : '// accept a contract to unlock sectors'
          }</p>
          ${canLaunch ? `<button class="lo-launch" id="lo-launch">LAUNCH SECTOR ▶</button>` : ''}
        </div>
      </div>`;

    el.querySelectorAll('.lo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (hub.loadout.includes(id)) {
          hub.loadout = hub.loadout.filter(x => x !== id);
        } else {
          if (hub.loadout.length >= maxSlots) {
            hubToast(`Loadout full (max ${maxSlots}) — remove a tool first`);
            return;
          }
          hub.loadout.push(id);
        }
        saveHub();
        buildLoadout();
      });
    });

    el.querySelector('#lo-launch')?.addEventListener('click', () => {
      if (typeof state !== 'undefined') state.deck = [...hub.loadout];
      if (typeof window.closeWindow === 'function') window.closeWindow('win-loadout');
      window.launchSector?.();
      hubToast('SECTOR ACTIVE — good luck, operator');
    });
  }

  // ── Terminal hub commands ─────────────────────────────────────
  // Called from TERM_COMMANDS wallpaper/connect in script.js
  window.hubTerminalCmd = function (rawCmd) {
    const parts = rawCmd.trim().split(/\s+/);
    const cmd   = parts[0];

    if (cmd === 'wallpaper') {
      if (parts[1] === '--rain') {
        if (parts[2] === 'on')  { setRain(true);  return 'rain enabled'; }
        if (parts[2] === 'off') { setRain(false); return 'rain disabled'; }
      }
      return null; // not fully handled — let script.js print usage
    }

    if (cmd === 'connect') {
      const ip = parts[1];
      if (!ip) return null; // let script.js print usage
      // Future: check against known server addresses
      return `connecting to ${ip}...\nconnection refused: no route to host\n(find a server address from your contacts)`;
    }

    return null; // not a hub command
  };

  // ── Rain ─────────────────────────────────────────────────────
  let rainCanvas = null, rainCtx = null, rainDrops = [], rainRaf = null;
  const RAIN_CHARS = '01アイウエオカキクケコサシスセソタチツテトナニ';

  function initRain () { if (hub.rainOn) startRain(); }

  function setRain (on) {
    hub.rainOn = on;
    localStorage.setItem(RAIN_KEY, on ? 'true' : 'false');
    on ? startRain() : stopRain();
  }

  function startRain () {
    if (rainCanvas) return;
    rainCanvas = document.createElement('canvas');
    rainCanvas.id = 'rain-canvas';
    Object.assign(rainCanvas.style, {
      position: 'fixed', inset: '0', width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '2', opacity: '0.2',
    });
    document.getElementById('desktop')?.appendChild(rainCanvas);
    rainCtx = rainCanvas.getContext('2d');
    resizeRain();
    window.addEventListener('resize', resizeRain);
    animRain();
  }

  function stopRain () {
    cancelAnimationFrame(rainRaf);
    rainCanvas?.remove();
    rainCanvas = null; rainCtx = null; rainDrops = []; rainRaf = null;
    window.removeEventListener('resize', resizeRain);
  }

  function resizeRain () {
    if (!rainCanvas) return;
    rainCanvas.width  = window.innerWidth;
    rainCanvas.height = window.innerHeight;
    rainDrops = [];
    const cols = Math.floor(window.innerWidth / 14);
    for (let i = 0; i < cols; i++) {
      rainDrops.push({ x: i * 14, y: Math.random() * -window.innerHeight,
                       speed: 4 + Math.random() * 8, len: 8 + Math.floor(Math.random() * 16) });
    }
  }

  function animRain () {
    if (!rainCtx) return;
    rainCtx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
    rainCtx.font = '13px "Share Tech Mono", monospace';
    rainDrops.forEach(d => {
      for (let i = 0; i < d.len; i++) {
        rainCtx.fillStyle = `rgba(0,243,255,${(1 - i / d.len) * 0.55})`;
        rainCtx.fillText(RAIN_CHARS[Math.floor(Math.random() * RAIN_CHARS.length)], d.x, d.y - i * 14);
      }
      rainCtx.fillStyle = 'rgba(180,255,255,0.9)';
      rainCtx.fillText(RAIN_CHARS[Math.floor(Math.random() * RAIN_CHARS.length)], d.x, d.y);
      d.y += d.speed;
      if (d.y > window.innerHeight + d.len * 14) { d.y = -d.len * 14; d.speed = 4 + Math.random() * 8; }
    });
    rainRaf = requestAnimationFrame(animRain);
  }

  // ── Helpers ───────────────────────────────────────────────────
  function hubToast (msg) {
    const old = document.querySelectorAll('.hub-toast');
    if (old.length >= 3) old[0].remove();
    const el = document.createElement('div');
    el.className = 'hub-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('hub-toast-show'));
    setTimeout(() => { el.classList.remove('hub-toast-show'); setTimeout(() => el.remove(), 380); }, 3000);
  }

  // Expose so script.js showPowerToast can be replaced later
  window.showHubToastGlobal = hubToast;

  function typeInto (el, text, speed, done) {
    let i = 0; el.textContent = '';
    const go = () => {
      if (i >= text.length) { done?.(); return; }
      el.textContent += text[i++];
      setTimeout(go, speed + Math.random() * 18);
    };
    setTimeout(go, 120);
  }

  function esc (s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtTs (ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  }

  function tierLbl (t) { return ['Script','Gray','Black','Ghost'][t] || 'Script'; }
  function tierCol (t) { return ['#7fffb8','#7fb8ff','#c87fff','#ff7fb8'][t] || '#7fffb8'; }

})();
