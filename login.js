// ============================================================
//  ABYSSAL OS — Login Screen  v1.0
//  Self-contained. Runs before DOMContentLoaded fires the
//  main script.js. Calls window.bootIntoDesktop() when done.
//  Stores operator profile in localStorage under 'abyssal_op'.
// ============================================================

(function () {
  'use strict';

  // ── Config ─────────────────────────────────────────────────
  const STORAGE_KEY  = 'abyssal_op';
  const BOOT_LINES   = [
    'ABYSSAL_OS KERNEL v0.7 — INITIALIZING...',
    'CHECKING SYSTEM INTEGRITY...',
    'LOADING MEMORY MODULES............  [OK]',
    'MOUNTING ENCRYPTED VOLUMES.........  [OK]',
    'STARTING NETWORK STACK.............  [OK]',
    'BYPASSING CORP FIREWALL LAYER......  [OK]',
    'ANONYMIZATION LAYER ACTIVE.........  [OK]',
    'LOADING OPERATOR PROFILE...',
  ];

  const ASCII_LOGO = [
    '  █████╗ ██████╗ ██╗   ██╗███████╗███████╗ █████╗ ██╗',
    ' ██╔══██╗██╔══██╗╚██╗ ██╔╝██╔════╝██╔════╝██╔══██╗██║',
    ' ███████║██████╔╝ ╚████╔╝ ███████╗███████╗███████║██║',
    ' ██╔══██║██╔══██╗  ╚██╔╝  ╚════██║╚════██║██╔══██║██║',
    ' ██║  ██║██████╔╝   ██║   ███████║███████║██║  ██║███████╗',
    ' ╚═╝  ╚═╝╚═════╝    ╚═╝   ╚══════╝╚══════╝╚═╝  ╚═╝╚══════╝',
    '',
    '              O P E R A T O R   T E R M I N A L',
    '         ─────────────────────────────────────────',
  ];

  // ── State ──────────────────────────────────────────────────
  let profile    = null;   // { id, passwordHash, createdAt, lastLogin }
  let skipBtn    = null;
  let inputEl    = null;

  // ── Entry ──────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    // Hide the desktop until login completes
    const desktop = document.getElementById('desktop');
    if (desktop) desktop.style.display = 'none';

    buildLoginDOM();
    profile = loadProfile();
    runBootSequence();
  }

  // ── DOM construction ───────────────────────────────────────
  function buildLoginDOM() {
    const screen = document.createElement('div');
    screen.id = 'login-screen';
    screen.innerHTML = `
      <div class="ls-scanlines" aria-hidden="true"></div>

      <div id="ls-boot-log" class="ls-boot-log" aria-live="polite" aria-label="System boot log"></div>

      <div id="ls-logo" class="ls-logo hidden" aria-hidden="true"></div>

      <div id="ls-auth" class="ls-auth hidden" role="main" aria-label="Operator authentication">

        <!-- ── Returning operator ─────────────────────── -->
        <div id="ls-returning" class="ls-returning hidden">
          <div class="ls-auth-label">OPERATOR_ID<span class="ls-cursor">_</span></div>
          <div id="ls-id-display"   class="ls-typed-value"></div>
          <div class="ls-auth-label ls-mt">PASSWORD<span class="ls-cursor">_</span></div>
          <div id="ls-pw-display"   class="ls-typed-value"></div>
          <div id="ls-auth-status"  class="ls-auth-status"></div>
        </div>

        <!-- ── New operator ───────────────────────────── -->
        <div id="ls-new" class="ls-new hidden">
          <div class="ls-new-header">
            <span class="ls-warn">⚠</span> NEW PROFILE DETECTED
          </div>
          <div class="ls-new-sub">Create your operator identity. This is who you are.</div>

          <div class="ls-field-wrap">
            <label class="ls-field-label" for="ls-name-input">OPERATOR_ID</label>
            <div class="ls-input-row">
              <span class="ls-prompt">root@ABYSSAL:~#</span>
              <input id="ls-name-input"
                     class="ls-input"
                     type="text"
                     maxlength="16"
                     autocomplete="off"
                     spellcheck="false"
                     autocorrect="off"
                     autocapitalize="characters"
                     placeholder="ENTER_CALLSIGN"
                     aria-label="Enter your operator callsign" />
            </div>
            <div id="ls-name-error" class="ls-field-error" role="alert"></div>
          </div>

          <button id="ls-create-btn" class="ls-btn-primary" aria-label="Create operator profile">
            CREATE PROFILE  ▶
          </button>
        </div>

      </div>

      <!-- ── Skip ─────────────────────────────────────── -->
      <div id="ls-skip-wrap" class="ls-skip-wrap hidden">
        <button id="ls-skip-btn" class="ls-skip-btn" aria-label="Skip login and go to quick access">
          [ SKIP → QUICK ACCESS ]
        </button>
      </div>
    `;

    document.body.insertBefore(screen, document.body.firstChild);

    // Wire up inputs
    inputEl  = screen.querySelector('#ls-name-input');
    skipBtn  = screen.querySelector('#ls-skip-btn');

    skipBtn.addEventListener('click', onSkip);

    screen.querySelector('#ls-create-btn').addEventListener('click', onCreateProfile);

    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') onCreateProfile();
      // Force uppercase
      setTimeout(() => { inputEl.value = inputEl.value.toUpperCase(); }, 0);
    });
  }

  // ── Boot sequence ──────────────────────────────────────────
  function runBootSequence() {
    const log = document.getElementById('ls-boot-log');
    let lineIdx = 0;
    const LINE_DELAY = 120;

    function printNext() {
      if (lineIdx >= BOOT_LINES.length) {
        // Boot done — show logo then auth
        setTimeout(showLogo, 200);
        return;
      }
      const line = document.createElement('div');
      line.className = 'ls-boot-line';
      // Stagger the OK suffix color for visual variety
      const text = BOOT_LINES[lineIdx];
      line.innerHTML = text.includes('[OK]')
        ? text.replace('[OK]', '<span class="ls-ok">[OK]</span>')
        : text;

      log.appendChild(line);
      log.scrollTop = log.scrollHeight;

      // Animate line in
      requestAnimationFrame(() => line.classList.add('visible'));

      lineIdx++;
      setTimeout(printNext, lineIdx < 3 ? LINE_DELAY * 0.5 : LINE_DELAY);
    }

    setTimeout(printNext, 400);
  }

  // ── Logo ───────────────────────────────────────────────────
  function showLogo() {
    const logoEl = document.getElementById('ls-logo');
    logoEl.innerHTML = ASCII_LOGO
      .map(l => `<div class="ls-logo-line">${escapeHtml(l)}</div>`)
      .join('');
    logoEl.classList.remove('hidden');

    // Stagger each logo line
    const lines = logoEl.querySelectorAll('.ls-logo-line');
    lines.forEach((l, i) => {
      setTimeout(() => l.classList.add('visible'), i * 55);
    });

    const totalDelay = lines.length * 55 + 300;
    setTimeout(showAuth, totalDelay);
  }

  // ── Auth panel ─────────────────────────────────────────────
  function showAuth() {
    const auth  = document.getElementById('ls-auth');
    const skip  = document.getElementById('ls-skip-wrap');
    auth.classList.remove('hidden');
    auth.classList.add('visible');
    skip.classList.remove('hidden');
    skip.classList.add('visible');

    if (profile) {
      showReturningAuth();
    } else {
      showNewAuth();
    }
  }

  function showReturningAuth() {
    const panel   = document.getElementById('ls-returning');
    const idDisp  = document.getElementById('ls-id-display');
    const pwDisp  = document.getElementById('ls-pw-display');
    const status  = document.getElementById('ls-auth-status');
    panel.classList.remove('hidden');

    // Type out the operator ID
    typeText(idDisp, profile.id, 80, () => {
      // Then type password dots
      const fakePw = '•'.repeat(Math.min(profile.id.length + 4, 12));
      typeText(pwDisp, fakePw, 60, () => {
        // Show authenticating
        status.textContent = 'AUTHENTICATING...';
        status.classList.add('ls-authenticating');
        setTimeout(() => {
          status.textContent = `ACCESS GRANTED — WELCOME BACK, ${profile.id}`;
          status.classList.remove('ls-authenticating');
          status.classList.add('ls-granted');
          setTimeout(bootTransition, 1200);
        }, 900);
      });
    });
  }

  function showNewAuth() {
    const panel = document.getElementById('ls-new');
    panel.classList.remove('hidden');
    setTimeout(() => {
      if (inputEl) {
        inputEl.focus();
        inputEl.placeholder = 'ENTER_CALLSIGN_';
        // Animate placeholder cursor
        let on = true;
        const blink = setInterval(() => {
          if (!inputEl || document.activeElement === inputEl) { clearInterval(blink); return; }
          on = !on;
          inputEl.placeholder = on ? 'ENTER_CALLSIGN_' : 'ENTER_CALLSIGN ';
        }, 500);
      }
    }, 200);
  }

  // ── Profile creation ───────────────────────────────────────
  function onCreateProfile() {
    const val   = (inputEl.value || '').trim().toUpperCase();
    const errEl = document.getElementById('ls-name-error');
    errEl.textContent = '';

    if (!val || val.length < 2) {
      errEl.textContent = 'CALLSIGN TOO SHORT — MINIMUM 2 CHARACTERS';
      inputEl.focus();
      return;
    }
    if (!/^[A-Z0-9_\-]+$/.test(val)) {
      errEl.textContent = 'INVALID CHARACTERS — USE A-Z, 0-9, _ OR -';
      inputEl.focus();
      return;
    }

    profile = { id: val, createdAt: Date.now(), lastLogin: Date.now() };
    saveProfile(profile);

    // Transition: hide new form, show returning flow
    document.getElementById('ls-new').classList.add('hidden');
    document.getElementById('ls-returning').classList.remove('hidden');
    document.getElementById('ls-returning').classList.add('visible');

    const status = document.getElementById('ls-auth-status');
    status.textContent = `PROFILE CREATED — OPERATOR ${val} REGISTERED`;
    status.classList.add('ls-granted');
    setTimeout(bootTransition, 1400);
  }

  // ── Skip ───────────────────────────────────────────────────
  function onSkip() {
    // If no profile yet, create a guest one
    if (!profile) {
      profile = { id: 'GUEST_OP', createdAt: Date.now(), lastLogin: Date.now(), guest: true };
    }
    bootTransition(true);
  }

  // ── Boot transition ────────────────────────────────────────
  function bootTransition(fast = false) {
    const screen = document.getElementById('login-screen');
    if (!screen) { revealDesktop(); return; }

    // Glitch flash then sweep out
    screen.classList.add('ls-glitch');
    setTimeout(() => {
      screen.classList.add('ls-exit');
      setTimeout(revealDesktop, fast ? 300 : 700);
    }, fast ? 100 : 350);
  }

  function revealDesktop() {
    const screen  = document.getElementById('login-screen');
    const desktop = document.getElementById('desktop');

    if (screen)  screen.remove();
    if (desktop) {
      desktop.style.display = '';
      desktop.classList.add('desktop-boot');
      setTimeout(() => desktop.classList.remove('desktop-boot'), 800);
    }

    // Set the operator name in the OS
    if (profile && !profile.guest) {
      profile.lastLogin = Date.now();
      saveProfile(profile);
    }

    // Call main game init if it exposes one
    if (typeof window.bootIntoDesktop === 'function') {
      window.bootIntoDesktop(profile);
    } else if (typeof window.setSysName === 'function') {
      window.setSysName(profile ? profile.id : 'SYS_ABYSSAL');
    }
  }

  // ── Helpers ────────────────────────────────────────────────
  function typeText(el, text, speed, onDone) {
    let i = 0;
    el.textContent = '';
    function step() {
      if (i >= text.length) { if (onDone) onDone(); return; }
      el.textContent += text[i++];
      setTimeout(step, speed + Math.random() * 30);
    }
    setTimeout(step, 120);
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/ /g, '&nbsp;');
  }

  function loadProfile() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function saveProfile(p) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* quota */ }
  }

  // Expose for external use (e.g. reset run clears profile)
  window.abyssalLogin = {
    getProfile: () => profile,
    clearProfile: () => {
      localStorage.removeItem(STORAGE_KEY);
      profile = null;
    },
  };

})();
