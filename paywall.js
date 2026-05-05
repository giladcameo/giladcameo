/**
 * paywall.js — lightweight trial timer + password paywall
 *
 * Usage (add before </body> in each app):
 *   <script src="paywall.js" data-app="shade-nav" data-minutes="10"></script>
 *
 * Change the password below. It lives in client-side JS, so it stops
 * casual users — anyone determined enough to read source can bypass it,
 * but that's true of any client-only paywall.
 */
(function () {
  // ── CONFIG — change these ─────────────────────────────────────────────────
  const PASSWORD = 'shady2025';   // ← set your password here
  const CONTACT  = '';            // ← optional: email/link shown on the modal
  // ─────────────────────────────────────────────────────────────────────────

  const el   = document.currentScript;
  const APP  = el?.dataset.app  || location.pathname.replace(/\W+/g, '_');
  const MINS = parseInt(el?.dataset.minutes ?? 10);

  const UKEY = 'pu_' + APP;   // unlocked flag key
  const TKEY = 'pt_' + APP;   // elapsed-seconds key

  // Already unlocked on a previous visit — bail out immediately
  if (localStorage.getItem(UKEY) === '1') return;

  // ── Inject styles ─────────────────────────────────────────────────────────
  const css = document.createElement('style');
  css.textContent = `
    #pw-badge {
      position: fixed; bottom: 18px; right: 18px; z-index: 99998;
      background: rgba(13,17,23,.85); color: #e6edf3;
      font: 700 11px/1 monospace; padding: 6px 12px;
      border-radius: 20px; border: 1px solid rgba(255,255,255,.12);
      backdrop-filter: blur(8px); pointer-events: none;
      transition: color .3s, border-color .3s;
      display: flex; align-items: center; gap: 6px;
    }
    #pw-badge::before {
      content: ''; width: 6px; height: 6px; border-radius: 50%;
      background: currentColor; flex-shrink: 0;
    }
    #pw-badge.warn   { color: #f59e0b; border-color: rgba(245,158,11,.35); }
    #pw-badge.urgent { color: #ef4444; border-color: rgba(239,68,68,.35); animation: pw-pulse 1s infinite; }
    @keyframes pw-pulse { 50% { opacity: .35; } }

    #pw-overlay {
      display: none; position: fixed; inset: 0; z-index: 99999;
      background: rgba(0,0,0,.8); backdrop-filter: blur(10px);
      align-items: center; justify-content: center;
    }
    #pw-overlay.open { display: flex; animation: pw-fade .25s ease; }
    @keyframes pw-fade { from { opacity: 0; } to { opacity: 1; } }

    #pw-card {
      background: #161b22; color: #e6edf3;
      border: 1px solid #30363d; border-radius: 14px;
      padding: 36px 30px 28px; max-width: 360px; width: 92%;
      text-align: center;
      box-shadow: 0 24px 64px rgba(0,0,0,.7);
      animation: pw-rise .25s ease;
    }
    @keyframes pw-rise { from { transform: translateY(12px); opacity: 0; } to { transform: none; opacity: 1; } }

    #pw-card .pw-icon { font-size: 38px; margin-bottom: 14px; line-height: 1; }
    #pw-card h2 { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
    #pw-card .pw-sub {
      font-size: 13px; color: #8b949e; line-height: 1.65; margin-bottom: 24px;
    }
    #pw-input {
      width: 100%; padding: 11px 14px;
      background: #0d1117; border: 1px solid #30363d;
      border-radius: 8px; color: #e6edf3; font-size: 15px;
      outline: none; margin-bottom: 10px;
      text-align: center; letter-spacing: 3px;
      transition: border-color .2s;
    }
    #pw-input:focus { border-color: #22c55e; }
    #pw-input.shake {
      border-color: #ef4444;
      animation: pw-shake .3s ease;
    }
    @keyframes pw-shake {
      0%,100% { transform: translateX(0); }
      25%      { transform: translateX(-7px); }
      75%      { transform: translateX(7px); }
    }
    #pw-btn {
      width: 100%; padding: 12px;
      background: #22c55e; color: #0d1117;
      border: none; border-radius: 8px;
      font-size: 14px; font-weight: 700; cursor: pointer;
      transition: background .15s, transform .1s;
    }
    #pw-btn:hover  { background: #4ade80; }
    #pw-btn:active { transform: scale(.97); }
    #pw-err { font-size: 12px; color: #ef4444; margin-top: 9px; min-height: 18px; }
    #pw-contact {
      margin-top: 16px; font-size: 11px; color: #484f58;
    }
    #pw-contact a { color: #8b949e; }
  `;
  document.head.appendChild(css);

  // ── Badge ─────────────────────────────────────────────────────────────────
  const badge = document.createElement('div');
  badge.id = 'pw-badge';
  document.body.appendChild(badge);

  // ── Modal ─────────────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'pw-overlay';
  overlay.innerHTML = `
    <div id="pw-card">
      <div class="pw-icon">&#127807;</div>
      <h2>Free trial ended</h2>
      <p class="pw-sub">
        You've used your ${MINS}-minute free preview.<br>
        Enter the access password to unlock this app permanently.
      </p>
      <input id="pw-input" type="password" placeholder="Enter password" autocomplete="off" />
      <button id="pw-btn">Unlock Access</button>
      <div id="pw-err"></div>
      ${CONTACT ? `<div id="pw-contact">Need access? <a href="${CONTACT}" target="_blank">Contact us</a></div>` : ''}
    </div>`;
  document.body.appendChild(overlay);

  // ── Password logic ────────────────────────────────────────────────────────
  function tryUnlock() {
    const inp = document.getElementById('pw-input');
    if (inp.value === PASSWORD) {
      localStorage.setItem(UKEY, '1');
      overlay.classList.remove('open');
      badge.remove();
      clearInterval(ticker);
    } else {
      inp.classList.remove('shake');
      void inp.offsetWidth;            // force reflow to restart animation
      inp.classList.add('shake');
      document.getElementById('pw-err').textContent = 'Wrong password — try again';
      inp.value = '';
      inp.focus();
    }
  }

  document.getElementById('pw-btn').onclick = tryUnlock;
  document.getElementById('pw-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') tryUnlock();
    document.getElementById('pw-err').textContent = '';
    document.getElementById('pw-input').classList.remove('shake');
  });

  // ── Timer ─────────────────────────────────────────────────────────────────
  const LIMIT = MINS * 60;
  const t0 = Date.now();

  function getElapsed() {
    return parseInt(localStorage.getItem(TKEY) || '0') +
           Math.floor((Date.now() - t0) / 1000);
  }

  function fmt(sec) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')} free`;
  }

  function tick() {
    const elapsed = getElapsed();
    localStorage.setItem(TKEY, elapsed);
    const rem = Math.max(0, LIMIT - elapsed);

    badge.textContent = fmt(rem);
    badge.className = rem < 30 ? 'urgent' : rem < 120 ? 'warn' : '';

    if (rem === 0) {
      clearInterval(ticker);
      overlay.classList.add('open');
    }
  }

  // Show immediately, then tick every second
  const initRem = Math.max(0, LIMIT - getElapsed());
  badge.textContent = fmt(initRem);
  if (initRem === 0) {
    overlay.classList.add('open');
  } else {
    const ticker = setInterval(tick, 1000);
    // keep ticker in scope for tryUnlock
    document.getElementById('pw-btn').onclick = function () {
      const inp = document.getElementById('pw-input');
      if (inp.value === PASSWORD) {
        localStorage.setItem(UKEY, '1');
        overlay.classList.remove('open');
        badge.remove();
        clearInterval(ticker);
      } else {
        inp.classList.remove('shake');
        void inp.offsetWidth;
        inp.classList.add('shake');
        document.getElementById('pw-err').textContent = 'Wrong password — try again';
        inp.value = '';
        inp.focus();
      }
    };
    document.getElementById('pw-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('pw-btn').click();
      document.getElementById('pw-err').textContent = '';
      document.getElementById('pw-input').classList.remove('shake');
    });
  }
})();
