// ============================================================
//  HACKNODE — UI  v4
//  Key fix: fan uses direct inline style.transform, no
//  @keyframes animation (which overrides transform on resolve).
//  Cards reveal via opacity class toggle + CSS transition.
// ============================================================

const UI = {
  _tlog: [],

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) { el.classList.add('active'); this._flicker(); }
  },
  _flicker() {
    const o = document.getElementById('scanline-overlay');
    if (!o) return;
    o.style.opacity = '0.65';
    setTimeout(() => { o.style.opacity = '0.18'; }, 80);
  },
  renderMenu() { this.showScreen('screen-menu'); },

  // ── MAP ─────────────────────────────────────────────────
  renderMap() {
    this.showScreen('screen-map');
    this.updateHUD();
    const q = id => document.getElementById(id);
    q('map-org-name').textContent     = GameState.org.name;
    q('map-org-sublabel').textContent = GameState.org.sublabel;
    q('map-org-flavor').textContent   = GameState.org.flavor;

    const container = q('map-nodes');
    container.innerHTML = '';

    GameState.nodes.forEach((node, i) => {
      const div = document.createElement('div');
      const classes = ['net-node',
        node.cleared  ? 'nn-cleared' : '',
        node.locked   ? 'nn-locked'  : '',
        node.isBoss   ? 'nn-boss'    : '',
        (!node.cleared && !node.locked) ? 'nn-active' : '',
      ].filter(Boolean).join(' ');
      div.className = classes;
      div.setAttribute('role', 'button');
      div.setAttribute('tabindex', node.locked || node.cleared ? '-1' : '0');
      div.setAttribute('aria-label',
        `${node.label}${node.locked ? ' locked' : node.cleared ? ' cleared' : ' — breach'}`);
      div.style.setProperty('--nc', node.color);
      div.style.animationDelay = `${i * 60}ms`;

      const hpPct = Math.round((node.hp / node.maxHp) * 100);
      div.innerHTML = `
        <div class="nn-frame">
          <div class="nn-corner nn-tl"></div><div class="nn-corner nn-tr"></div>
          <div class="nn-corner nn-bl"></div><div class="nn-corner nn-br"></div>
          <div class="nn-icon-wrap">
            <span class="nn-icon">${node.cleared ? '✓' : node.locked ? '🔒' : node.icon}</span>
          </div>
          <svg class="nn-ring-svg" viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="2.5"/>
            <circle cx="24" cy="24" r="20" fill="none" stroke="${node.color}" stroke-width="2.5"
              stroke-dasharray="${hpPct * 1.257} 125.7" stroke-linecap="round"
              transform="rotate(-90 24 24)" opacity="0.85"/>
          </svg>
        </div>
        <div class="nn-label">${node.label}</div>
        <div class="nn-sublabel">${node.sublabel}</div>
        ${node.weaknessRevealed && node.weakness.length
          ? `<div class="nn-weak">⚠ ${node.weakness.join(' ')}</div>` : ''}
        ${node.isBoss ? '<div class="nn-boss-badge">⬛ PRIMARY TARGET ⬛</div>' : ''}
      `;

      if (!node.locked && !node.cleared) {
        div.addEventListener('click',   () => enterNode(i));
        div.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enterNode(i); }
        });
      }
      container.appendChild(div);
    });

    this._drawMapLines();
  },

  _drawMapLines() {
    const svg = document.getElementById('map-connections');
    if (!svg) return;
    svg.innerHTML = '';
    requestAnimationFrame(() => {
      const wrap = document.querySelector('.map-wrap');
      const nodes = document.querySelectorAll('.net-node');
      if (!wrap || !nodes.length) return;
      const wr = wrap.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${wr.width} ${wr.height}`);

      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i].getBoundingClientRect();
        const b = nodes[i + 1].getBoundingClientRect();
        const x1 = a.left - wr.left + a.width / 2;
        const y1 = a.top  - wr.top  + a.height / 2;
        const x2 = b.left - wr.left + b.width / 2;
        const y2 = b.top  - wr.top  + b.height / 2;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1);
        line.setAttribute('x2', x2); line.setAttribute('y2', y2);
        line.classList.add('map-line');
        if (i === nodes.length - 2) line.classList.add('boss-line');
        svg.appendChild(line);

        // Travelling packet dot
        if (!nodes[i].classList.contains('nn-locked')) {
          const pathId = `mp${i}`;
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('id', pathId);
          path.setAttribute('d', `M${x1},${y1} L${x2},${y2}`);
          path.setAttribute('fill', 'none');
          svg.appendChild(path);
          const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          dot.setAttribute('r', '3');
          dot.classList.add('map-packet');
          const anim = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
          anim.setAttribute('dur', `${1.8 + i * 0.35}s`);
          anim.setAttribute('repeatCount', 'indefinite');
          const mp = document.createElementNS('http://www.w3.org/2000/svg', 'mpath');
          mp.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `#${pathId}`);
          anim.appendChild(mp);
          dot.appendChild(anim);
          svg.appendChild(dot);
        }
      }
    });
  },

  // ── HACK SCREEN ──────────────────────────────────────────
  renderHack() {
    this.showScreen('screen-hack');
    this.updateHUD();
    this._renderTargetPanel();
    this._renderSynergyRow();
    this._renderControlsBar();
    this._renderFanHand();
  },

  _renderTargetPanel() {
    const node = GameState.currentNode;
    if (!node) return;
    const pct = Math.max(0, (GameState.nodeHp / GameState.nodeMaxHp) * 100);
    const q   = id => document.getElementById(id);

    q('t-icon').textContent  = node.icon;
    q('t-icon').style.filter = `drop-shadow(0 0 18px ${node.color})`;
    q('t-name').textContent  = node.label;
    q('t-sub').textContent   = node.sublabel;
    q('t-flavor').textContent = node.flavor;
    q('t-node-id').textContent = `NODE_${String(GameState.currentNodeIndex + 1).padStart(2,'0')}`;

    q('t-hp-txt').textContent = `${node.hp.toLocaleString()} / ${node.maxHp.toLocaleString()}`;
    q('t-pct').textContent    = `${Math.round(100 - pct)}% BREACHED`;
    q('t-reward').textContent = `+${node.reward.data} GB`;
    q('t-mult-val').textContent = `×${GameState.multiplier.toFixed(2)}`;

    const fill = q('t-hp-fill');
    if (fill) { fill.style.width = pct + '%'; fill.style.setProperty('--hpc', node.color); }

    const bar = q('target-hp-bar');
    if (bar) {
      bar.setAttribute('aria-valuenow', Math.round(pct));
      bar.classList.toggle('hp-crit', pct < 25);
    }

    const wk = q('t-weakness');
    if (wk) {
      if (GameState.nodeWeaknessRevealed && node.weakness.length) {
        wk.innerHTML = node.weakness.map(w =>
          `<span class="wtag">${w.toUpperCase()}</span>`).join('');
        wk.style.display = 'flex';
      } else {
        wk.style.display = 'none';
      }
    }
  },

  _renderSynergyRow() {
    const el = document.getElementById('synergy-strip');
    if (!el) return;

    if (GameState.activeSynergies.length > 0) {
      el.innerHTML = GameState.activeSynergies.map(s => `
        <span class="syn-chip active-syn" style="--sc:${s.color||'#ffd700'}">
          <span class="syn-tier tier-${s.tier}">${s.tier}</span>
          <strong class="syn-name">${s.name}</strong>
          <span class="syn-desc">${s.desc}</span>
        </span>`).join('');
      return;
    }

    const pending = SYNERGIES.filter(syn => {
      const half = syn.ids.some(id => GameState.nodePlayedIds.includes(id));
      const inPool = syn.ids.some(id =>
        !GameState.nodePlayedIds.includes(id) &&
        [...GameState.hand, ...GameState.deck, ...GameState.discard].some(c => c.id === id));
      return half && inPool;
    });

    el.innerHTML = pending.length
      ? pending.slice(0, 3).map(s =>
          `<span class="syn-chip pending-syn" style="--sc:${s.color||'#4af0ff'}">◉ ${s.name} — ${s.desc}</span>`
        ).join('')
      : `<span class="syn-empty">// No active synergies — chain tools to unlock</span>`;
  },

  _renderControlsBar() {
    const q = id => document.getElementById(id);

    const di = q('deck-info');
    if (di) di.textContent = `DECK ${GameState.deck.length}  //  DISCARD ${GameState.discard.length}`;

    const mEl = q('live-mult');
    if (mEl) {
      mEl.textContent = `×${GameState.multiplier.toFixed(2)}`;
      mEl.className = 'live-mult' +
        (GameState.multiplier >= 1.5 ? ' mult-fire' : GameState.multiplier >= 1.2 ? ' mult-warm' : '');
    }

    const ps = q('played-strip');
    if (ps) {
      ps.innerHTML = GameState.playedThisTurn.map(t => {
        const r = Object.values(RARITY)[t.rarity];
        return `<span class="ptag" style="--rc:${r.color}">${t.icon} ${t.name}</span>`;
      }).join('');
    }
  },

  // ═══════════════════════════════════════════════════════
  //  FAN HAND — the critical function
  //
  //  ROOT CAUSE OF PREVIOUS BUG:
  //  @keyframes card-deal used `animation-fill-mode: both`.
  //  When the animation finished, its `to` keyframe value
  //  became the element's "animated" transform, which has
  //  higher cascade priority than the CSS property OR the
  //  inline style set before the animation ran.
  //
  //  FIX: NO @keyframes animation on cards at all.
  //  Fan transform is set as inline style.transform.
  //  Deal-in effect uses opacity: CSS transition triggered
  //  by adding a class after a setTimeout.
  //  Hover is `!important` which beats inline styles.
  // ═══════════════════════════════════════════════════════
  _renderFanHand() {
    const container = document.getElementById('hand-container');
    if (!container) return;
    container.innerHTML = '';

    if (GameState.hand.length === 0) {
      container.innerHTML = '<div class="empty-hand">// HAND EMPTY — PRESS [E] TO DRAW</div>';
      return;
    }

    // Synergy hints — cards that complete a pending combo
    const synHint = new Set();
    SYNERGIES.forEach(syn => {
      const playedHalf = syn.ids.some(id => GameState.nodePlayedIds.includes(id));
      if (playedHalf) {
        syn.ids.forEach(id => {
          if (!GameState.nodePlayedIds.includes(id) && GameState.hand.some(h => h.id === id))
            synHint.add(id);
        });
      }
    });

    const n = GameState.hand.length;
    // Arc parameters
    const maxTotalAngle = Math.min(8 + n * 4, 32); // total arc degrees across all cards
    const yDropPerDeg   = 2.5;                      // px drop per degree of rotation

    GameState.hand.forEach((tool, i) => {
      const rar    = Object.values(RARITY)[tool.rarity];
      const isSyn  = synHint.has(tool.id);

      // Fan math
      const t      = n > 1 ? (i / (n - 1)) - 0.5 : 0; // -0.5 (leftmost) to +0.5 (rightmost)
      const angle  = t * maxTotalAngle;                  // rotation degrees
      const yDrop  = Math.abs(angle) * yDropPerDeg;      // drop outer cards down
      const zIndex = n - Math.round(Math.abs(t) * n);    // center cards on top

      const card = document.createElement('button');
      card.className = `bcard rarity-${tool.rarity}${isSyn ? ' syn-hint' : ''}`;
      card.setAttribute('role', 'listitem');
      card.setAttribute('aria-label', `Play ${tool.name} — ${tool.desc}`);

      // Set rarity CSS vars
      card.style.setProperty('--rc', rar.color);
      card.style.setProperty('--rg', rar.glow);
      card.style.zIndex = String(zIndex);

      // ★ THE FAN TRANSFORM — set directly, no @keyframes conflict ★
      card.style.transform        = `rotate(${angle}deg) translateY(${yDrop}px)`;
      card.style.transformOrigin  = 'bottom center';

      card.innerHTML = `
        <div class="bc-rarity">${rar.label}</div>
        <div class="bc-icon">${tool.icon}</div>
        <div class="bc-name">${tool.name}</div>
        <div class="bc-desc">${tool.desc}</div>
        <div class="bc-flavor">${tool.flavor}</div>
        <div class="bc-stats">
          <div class="bc-stat">
            <div class="bc-stat-lbl">DMG</div>
            <div class="bc-stat-val bc-dmg">${tool.power > 0 ? tool.power : '—'}</div>
          </div>
          <div class="bc-stat">
            <div class="bc-stat-lbl">TRACE</div>
            <div class="bc-stat-val ${tool.cost === 0 ? 'bc-free' : 'bc-trc'}">${tool.cost === 0 ? 'FREE' : '+' + tool.cost}</div>
          </div>
          <div class="bc-stat">
            <div class="bc-stat-lbl">TIER</div>
            <div class="bc-stat-val" style="color:${Object.values(TIERS)[tool.tier].color}">${Object.values(TIERS)[tool.tier].label}</div>
          </div>
        </div>
        ${isSyn ? '<div class="bc-syn-badge">⚡ SYNERGY</div>' : ''}
      `;

      card.addEventListener('click', () => {
        if (card.disabled) return;
        card.classList.add('bc-playing');
        card.disabled = true;
        setTimeout(() => playTool(i), 160);
      });
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
      });

      container.appendChild(card);

      // ★ Deal-in via opacity transition only — no transform animation ★
      // The card starts opacity:0 (from CSS), then gets .bc-visible after a staggered delay
      setTimeout(() => card.classList.add('bc-visible'), i * 65 + 20);
    });
  },

  // ── UPGRADE ─────────────────────────────────────────────
  renderUpgrade(toolCount) {
    this.showScreen('screen-upgrade');
    this.updateHUD();
    const upgs  = this._pickUpgOffers(3);
    const tools = generateToolOffers();

    const grid = document.getElementById('upgrade-grid');
    grid.innerHTML = '';
    upgs.forEach((u, i) => {
      const btn = document.createElement('button');
      btn.className = 'upg-card';
      btn.id = `upg-${u.id}`;
      btn.innerHTML = `<div class="upg-icon">${u.icon}</div><div class="upg-name">${u.name}</div><div class="upg-desc">${u.desc}</div>`;
      btn.style.animationDelay = `${i * 80}ms`;
      btn.addEventListener('click', () => selectUpgrade(u.id));
      grid.appendChild(btn);
    });

    const sec = document.getElementById('tool-reward-section');
    if (toolCount > 0 && tools.length > 0) {
      sec.style.display = 'block';
      this._renderRewardCards(tools);
    } else {
      sec.style.display = 'none';
    }
    const skip = document.getElementById('skip-tool-btn');
    if (skip) skip.onclick = () => skipToolReward();
  },

  markUpgradeSelected(id) {
    document.querySelectorAll('.upg-card').forEach(b => {
      if (b.id === `upg-${id}`) b.classList.add('sel');
      else { b.classList.add('dim'); b.disabled = true; }
    });
    this.showToast('✅ Upgrade locked in');
  },

  _renderRewardCards(tools) {
    const grid = document.getElementById('tool-reward-grid');
    grid.innerHTML = '';
    tools.forEach((tool, i) => {
      const rar = Object.values(RARITY)[tool.rarity];
      const c = document.createElement('button');
      c.className = `bcard rarity-${tool.rarity} reward-card`;
      c.style.setProperty('--rc', rar.color);
      c.style.setProperty('--rg', rar.glow);
      c.style.transform = 'none';
      c.innerHTML = `
        <div class="bc-rarity">${rar.label}</div>
        <div class="bc-icon">${tool.icon}</div>
        <div class="bc-name">${tool.name}</div>
        <div class="bc-desc">${tool.desc}</div>
        <div class="bc-flavor">${tool.flavor}</div>
        <div class="bc-stats">
          <div class="bc-stat"><div class="bc-stat-lbl">DMG</div><div class="bc-stat-val bc-dmg">${tool.power||'—'}</div></div>
          <div class="bc-stat"><div class="bc-stat-lbl">TRACE</div><div class="bc-stat-val ${tool.cost===0?'bc-free':'bc-trc'}">${tool.cost===0?'FREE':'+'+tool.cost}</div></div>
        </div>`;
      setTimeout(() => c.classList.add('bc-visible'), i * 70 + 20);
      c.addEventListener('click', () => {
        addToolToDeck(tool.id);
        this.showToast(`${tool.icon} ${tool.name} added`);
        c.classList.add('sel'); c.disabled = true;
        grid.querySelectorAll('button:not(.sel)').forEach(b => { b.disabled=true; b.classList.add('dim'); });
      });
      grid.appendChild(c);
    });
  },

  _pickUpgOffers(n) {
    const avail = UPGRADES.filter(u => !GameState.upgrades.find(g => g.id === u.id));
    return [...avail].sort(() => Math.random() - 0.5).slice(0, n);
  },

  // ── END SCREENS ──────────────────────────────────────────
  renderGameOver(r) {
    this.showScreen('screen-gameover');
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('go-reason', r === 'trace' ? 'TRACED — You stayed too long.' : 'CONNECTION LOST');
    set('go-org',    GameState.org.name);
    set('go-data',   GameState.runData);
    set('go-nodes',  GameState.nodesCleared);
    set('go-score',  GameState.score.toLocaleString());
  },
  renderWin() {
    this.showScreen('screen-win');
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('win-org',   GameState.org.name);
    set('win-data',  GameState.runData);
    set('win-nodes', GameState.nodesCleared);
    set('win-score', GameState.score.toLocaleString());
  },

  // ── HUD ─────────────────────────────────────────────────
  updateHUD() {
    const trace = GameState.totalTrace, max = CONFIG.maxTrace;
    const pct   = (trace / max) * 100;
    const set   = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };

    set('hud-trace-text', `${trace} / ${max}`);
    set('hud-data',       GameState.runData);
    set('hud-stealth',    GameState.stealth);

    const fill = document.getElementById('hud-trace-fill');
    if (fill) {
      fill.style.width = pct + '%';
      fill.classList.toggle('warn', trace >= CONFIG.traceWarningThreshold);
      fill.classList.toggle('crit', trace >= max - 2);
    }

    const tierKeys = Object.keys(TIERS);
    const td = TIERS[tierKeys[Math.min(GameState.tier, tierKeys.length - 1)]];
    set('hud-tier', td.label);
    const te = document.getElementById('hud-tier'); if (te) te.style.color = td.color;

    const bb = document.getElementById('burner-btn');
    if (bb) {
      const ok = GameState.persistentEffects.burnerClear && !GameState.persistentEffects.burnerUsed;
      bb.style.display = ok ? 'inline-flex' : 'none';
    }
  },

  // ── Floating Numbers ─────────────────────────────────────
  showFloatingNumber(val, type) {
    const anchor = document.getElementById('target-panel') || document.body;
    const rect   = anchor.getBoundingClientRect();
    const el     = document.createElement('div');
    el.className = `fnum fnum-${type}`;
    if (type === 'damage')     el.textContent = `-${val.toLocaleString()}`;
    else if (type === 'crit')  el.textContent = '💥 CRIT';
    else                       el.textContent = `+${val} DATA`;
    el.style.left = (rect.left + rect.width  * (0.2 + Math.random() * 0.6)) + 'px';
    el.style.top  = (rect.top  + rect.height * (0.1 + Math.random() * 0.5)) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1600);
    if (type === 'damage' && val >= 30) this._shake(val >= 80 ? 'h' : 'm');
    this.addLog(
      type === 'damage' ? `[EXPLOIT] −${val} to firewall` :
      type === 'crit'   ? `[CRITICAL] Logic crit — ${val} damage` :
                          `[EXFIL] +${val} GB extracted`,
      type === 'damage' ? 'damage' : type === 'crit' ? 'crit' : 'data'
    );
  },

  _shake(level) {
    const el = document.getElementById('hack-arena');
    if (!el) return;
    el.classList.remove('shake-m','shake-h');
    void el.offsetWidth;
    el.classList.add(`shake-${level}`);
    setTimeout(() => el.classList.remove(`shake-${level}`), 440);
  },

  // ── Synergy Flash ─────────────────────────────────────────
  showSynergyFlash(syn) {
    document.querySelectorAll('.syn-flash').forEach(e => e.remove());
    const el = document.createElement('div');
    el.className = 'syn-flash';
    el.style.setProperty('--sc', syn.color || '#ffd700');
    el.innerHTML = `
      <div class="sf-inner">
        <div class="sf-eyebrow">TIER ${syn.tier} SYNERGY ACTIVATED</div>
        <div class="sf-name">${syn.name}</div>
        <div class="sf-desc">${syn.desc}</div>
      </div>`;
    document.body.appendChild(el);
    this.addLog(`[SYNERGY] ${syn.name} — ${syn.desc}`, 'syn');
    setTimeout(() => el.remove(), 3200);
  },

  // ── Terminal Log ──────────────────────────────────────────
  addLog(text, type = 'sys') {
    this._tlog.push({ text, type });
    if (this._tlog.length > 20) this._tlog.shift();
    const el = document.getElementById('tlog');
    if (!el) return;
    const line = document.createElement('div');
    line.className = `tl tl-${type}`;
    line.textContent = text;
    el.appendChild(line);
    while (el.children.length > 20) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
  },

  // ── Toast ─────────────────────────────────────────────────
  showToast(msg) {
    const old = document.querySelectorAll('.toast');
    if (old.length >= 3) old[0].remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, 2800);
  },
};
