/* Hailed cinematics module – plain ES modules, no dependencies.
   Full-screen effects that respect prefers-reduced-motion.
   pointer-events: none unless a card is actively showing. */

export const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ----- shared DOM -----
const head = document.querySelector('head');
const style = document.createElement('style');
style.textContent = `
  /* ── fader (used by fadeTo) ── */
  #fader{
    position:fixed;inset:0;z-index:50;background:#000;
    pointer-events:none;opacity:0;transition:opacity .26s linear;
  }
  @media (prefers-reduced-motion: reduce){
    #fader{transition:opacity 0s;}
  }

  /* ── act card (used by actCard) ── */
  #act-card{
    position:fixed;inset:0;z-index:60;pointer-events:none;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:24px;opacity:0;transition:opacity .36s ease-out;
  }
  @media (prefers-reduced-motion: reduce){
    #act-card{transition:opacity 0s;}
  }
  #act-card.show{opacity:1}
  #act-card{background:radial-gradient(ellipse at center,rgba(0,0,0,.72),rgba(0,0,0,.9))}
  #act-card .kicker{
    color:var(--dim);font:700 11px var(--cond);letter-spacing:.3em;text-transform:uppercase;margin-bottom:8px;
  }
  #act-card .title{
    color:var(--hi);font:700 clamp(36px,min(6vw,48px),64px)/.92 var(--cond);
    letter-spacing:.14em;text-align:center;line-height:1.1;
  }
  #act-card .subtitle{
    color:var(--text);font:400 clamp(14px,1.4vw,16px)/1.2 var(--cond);
    letter-spacing:.06em;max-width:60ch;text-align:center;
  }
  #act-card .letter-track{
    position:relative;color:inherit;display:flex;flex-direction:column;align-items:center;gap:14px;
  }
  #act-card .letter-track span{
    display:inline-block;transform:translateY(12px);opacity:0;
    transition:transform .36s cubic-bezier(.22,1,.36,1),opacity .36s cubic-bezier(.22,1,.36,1);
  }
  @media (prefers-reduced-motion: reduce){
    #act-card .letter-track span{
      transition:none;transform:none;opacity:1;
    }
  }
  #act-card .letter-track span.tracks-in{transform:translateY(0);opacity:1;}
  #act-card .letter-bar{
    position:absolute;left:0;width:100%;height:48px;background:#000;
    pointer-events:none;z-index:2;
  }
  #act-card .letter-bar.top{top:0;transform:translateY(-48px);transition:transform .36s cubic-bezier(.22,1,.36,1);}
  #act-card .letter-bar.bottom{bottom:0;transform:translateY(48px);transition:transform .36s cubic-bezier(.22,1,.36,1);}
  @media (prefers-reduced-motion: reduce){
    #act-card .letter-bar{
      transition:none;
    }
  }
  #act-card .letter-bar.top.visible{transform:translateY(0);}
  #act-card .letter-bar.bottom.visible{transform:translateY(0);}
  #act-card.skip{
    position:absolute;pointer-events:auto;top:0;left:0;width:100%;height:100%;
    cursor:default;
  }
  @media (prefers-reduced-motion: reduce){
    #act-card.skip{cursor:default;}
  }

  /* ── flash (used by flash) ── */
  #flash-overlay{
    position:fixed;inset:0;z-index:70;background:var(--color,#fff6d8);
    pointer-events:none;opacity:0;transition:opacity .6s linear;
  }
  @media (prefers-reduced-motion: reduce){
    #flash-overlay{transition:opacity 0s;}
  }

  /* ── title screen animation classes ── */
  @keyframes buttonStaggerIn{
    from{opacity:0;transform:translateY(20px);}
    to{opacity:1;transform:translateY(0);}
  }
  @keyframes lightSweep{
    0%{background-position:0% 50%;}
    100%{background-position:100% 50%;}
  }
  @keyframes signalPulse{
    0%,100%{opacity:0.3;transform:scaleX(1);}
    50%{opacity:0.8;transform:scaleX(1.05);}
  }
  @keyframes starDrift{
    0%{transform:translateX(0) translateY(0);opacity:.55;}
    100%{transform:translateX(-800px) translateY(-50px);opacity:.3;}
  }
  @media (prefers-reduced-motion: reduce){
    .no-animation *{animation:none!important;transition:none!important;}
  }
`
head.appendChild(style);

// ── fader element ──
let fader = document.getElementById('fader');
if (!fader) { fader = document.createElement('div'); fader.id = 'fader'; document.body.appendChild(fader); }

export function fadeTo(fn, ms = 260) {
  if (REDUCED) { fn(); return Promise.resolve(); }
  return new Promise((resolve) => {
    fader.style.opacity = '1';
    setTimeout(() => {
      fader.style.opacity = '0';
      setTimeout(() => { fn(); resolve(); }, ms);
    }, ms);
  });
}

// ── act card ──
let actCardTimer = null;
let card = document.getElementById('act-card');
if (!card) {
  const ac = document.createElement('div'); ac.id = 'act-card'; ac.innerHTML = `
    <div class="letter-bar top"></div>
    <div class="letter-bar bottom"></div>
    <div class="kicker"></div>
    <div class="letter-track"><span class="title"></span><span class="subtitle"></span></div>
    <div class="skip"></div>
  `;
  document.body.appendChild(ac);
  card = ac;
}
const actCardElement = card; // referenced above

export function actCard({ kicker, title, subtitle, ms = 3600 }) {
  const el = actCardElement;
  el.querySelector('.kicker').textContent = kicker || '';
  el.querySelector('.title').textContent = title || '';
  el.querySelector('.subtitle').textContent = subtitle || '';
  clearTimeout(actCardTimer);
  el.classList.remove('hidden', 'show');
  const bars = el.querySelectorAll('.letter-bar');
  const spans = el.querySelectorAll('.letter-track span');
  bars.forEach((b) => b.classList.remove('visible'));
  spans.forEach((sp) => sp.classList.remove('tracks-in'));
  void el.offsetWidth;   // restart the transitions
  el.classList.add('show');
  bars.forEach((b) => b.classList.add('visible'));
  spans.forEach((sp) => sp.classList.add('tracks-in'));
  el.style.pointerEvents = 'auto';
  return new Promise((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(actCardTimer);
      document.removeEventListener('keydown', onKey, true);
      el.removeEventListener('click', done);
      el.classList.remove('show');
      bars.forEach((b) => b.classList.remove('visible'));
      el.style.pointerEvents = 'none';
      setTimeout(() => { if (!el.classList.contains('show')) el.classList.add('hidden'); resolve(); }, REDUCED ? 0 : 400);
    };
    const onKey = (e) => { if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(); } };
    el.addEventListener('click', done);
    document.addEventListener('keydown', onKey, true);
    actCardTimer = setTimeout(done, REDUCED ? Math.min(ms, 1500) : ms);
  });
}

// ── delivery card (Act I / Act II+ strain deliveries) ──
export function deliveryCard({ star, strain }) {
  actCard({ kicker: 'STRAIN DELIVERED', title: star || 'A world',
    subtitle: `${strain || 'Taumoeba'} is hunting Astrophage.`, ms: 4000 });
  flash('#dff6ff');
}

// ── letterbox ──
let letterboxTop = null;
let letterboxBottom = null;

export function letterbox(on) {
  if (on) {
    if (!letterboxTop) {
      letterboxTop = document.createElement('div');
      letterboxTop.style = `
        position:fixed;left:0;right:0;height:50px;background:#000;pointer-events:none;z-index:99;
        top:0;transition:transform .3s cubic-bezier(.22,1,.36,1);
        @media (prefers-reduced-motion: reduce){transition:none;}
      `;
      letterboxBottom = letterboxTop.cloneNode(true);
      letterboxBottom.style.top = 'auto'; letterboxBottom.style.bottom = 0;
      document.body.appendChild(letterboxTop);
      document.body.appendChild(letterboxBottom);
    }
    letterboxTop.style.transform = 'translateY(-50px)';
    letterboxBottom.style.transform = 'translateY(50px)';
  } else {
    if (letterboxTop) {
      letterboxTop.style.transform = 'translateY(0)';
      letterboxBottom.style.transform = 'translateY(0)';
      setTimeout(() => {
        if (letterboxTop.parentNode) document.body.removeChild(letterboxTop);
        if (letterboxBottom.parentNode) document.body.removeChild(letterboxBottom);
        letterboxTop = null; letterboxBottom = null;
      }, 300);
    }
  }
}

// ── flash ──
let flashEl = null;
export function flash(color = '#fff6d8', ms = 600) {
  if (REDUCED) { return; }
  const c = color.startsWith('#') ? color : '#fff6d8';
  if (!flashEl) {
    flashEl = document.createElement('div'); flashEl.id = 'flash-overlay';
    flashEl.style.background = c;
    document.body.appendChild(flashEl);
  }
  flashEl.style.background = c;
  flashEl.style.opacity = '1';
  setTimeout(() => { flashEl.style.opacity = '0'; }, ms);
}