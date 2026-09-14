import { trackEvent } from './js/analytics.js';

/* =========================================================================
   HEWKAO — random menu wheel (/random-menu/).

   Needs no location and no API calls, so it works for visitors who won't
   share their location and costs nothing to run. The dish list in the page's
   HTML is the single source of truth: it's what search engines index, and
   the wheel reads its entries from that same markup.
   ========================================================================= */

const reel = document.getElementById('menuReel');
const spinBtn = document.getElementById('menuSpinBtn');
const poolNote = document.getElementById('menuPoolNote');
const resultEl = document.getElementById('menuResult');
const quipEl = document.getElementById('menuQuip');
const dishEl = document.getElementById('menuDish');
const blurbEl = document.getElementById('menuBlurb');
const findBtn = document.getElementById('menuFindBtn');
const shareBtn = document.getElementById('menuShareBtn');

const ROW_H = 64; // matches .menu-reel span height
const RECENT_TO_SKIP = 5;
const SHARE_LABEL = shareBtn.textContent;
const QUIPS = [
  'จักรวาลเลือกให้แล้ว',
  'ห้ามเถียง วันนี้กิน',
  'ท้องสั่งมาว่า',
  'ดวงวันนี้ถูกโฉลกกับ',
  'HEWKAO ฟันธง',
  'ไม่ต้องคิดแล้ว ไปกิน',
];

const DISHES = [...document.querySelectorAll('#dishList li[data-type]')].map(li => ({
  name: li.querySelector('b').textContent.trim(),
  blurb: li.querySelector('span').textContent.trim(),
  type: li.dataset.type,
  meals: li.dataset.meals.split(' '),
  price: li.dataset.price,
}));

const filters = { meal: '', type: '', price: '' };
let recent = [];
let spinCount = 0;
let spinning = false;

function currentPool() {
  return DISHES.filter(d =>
    (!filters.meal || d.meals.includes(filters.meal)) &&
    (!filters.type || d.type === filters.type) &&
    (!filters.price || d.price === filters.price));
}

function updatePoolNote() {
  const n = currentPool().length;
  spinBtn.disabled = n === 0 || spinning;
  poolNote.textContent = n
    ? `สุ่มจาก ${n} เมนู`
    : 'ไม่มีเมนูที่ตรงกับตัวกรอง ลองเลือกให้กว้างขึ้นหน่อย';
}

// Skips the last few dishes so "สุ่มใหม่" never hands back the same one, as
// long as the filtered pool still has something else to offer.
function pick(pool) {
  const fresh = pool.filter(d => !recent.includes(d.name));
  const from = fresh.length ? fresh : pool;
  const dish = from[Math.floor(Math.random() * from.length)];
  const keep = Math.max(0, Math.min(RECENT_TO_SKIP, pool.length - 1));
  recent = [dish.name, ...recent.filter(n => n !== dish.name)].slice(0, keep);
  return dish;
}

// Gets pushier the more dishes get rejected in a row.
function quipFor(count) {
  if (count >= 8) return 'HEWKAO เริ่มงอนแล้วนะ เอาอันนี้แหละ';
  if (count >= 5) return 'เลือกยากจัง งั้นเอาอันนี้ไป';
  return QUIPS[Math.floor(Math.random() * QUIPS.length)];
}

// Resolves on transitionend, with a watchdog in case the event never fires.
function animateReelTo(px, durationSec, easing) {
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      reel.removeEventListener('transitionend', finish);
      resolve();
    };
    // Double rAF so the reset before the first phase paints before it starts.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      reel.style.transition = `transform ${durationSec}s ${easing}`;
      reel.style.transform = `translateY(${px}px)`;
    }));
    reel.addEventListener('transitionend', finish);
    setTimeout(finish, durationSec * 1000 + 400);
  });
}

// Same two-phase timing as the map app's slot (spin-result.js): a fast
// constant-speed spin, then a long deceleration onto the pick. And like that
// slot it always plays in full, even with prefers-reduced-motion — the spin is
// the whole interaction here, and skipping it (common on Windows with
// animation effects turned off) made the wheel look like it stopped instantly.
async function animateReel(pool, dish) {
  const FAST_COUNT = 16;
  const SLOW_COUNT = 10;
  const total = FAST_COUNT + SLOW_COUNT;
  const names = Array.from({ length: total - 1 }, () => pool[Math.floor(Math.random() * pool.length)].name);
  names.push(dish.name);
  reel.replaceChildren(...names.map(name => Object.assign(document.createElement('span'), { textContent: name })));
  reel.style.transition = 'none';
  reel.style.transform = 'translateY(0)';
  void reel.offsetHeight;
  const finalY = -(total - 1) * ROW_H;
  await animateReelTo(-FAST_COUNT * ROW_H, 1.1, 'linear');
  await animateReelTo(finalY, 1.9, 'cubic-bezier(0.15,0.65,0.25,1)');
  await new Promise(resolve => setTimeout(resolve, 250));
}

async function spin() {
  const pool = currentPool();
  if (spinning || !pool.length) return;
  spinning = true;
  spinBtn.disabled = true;
  const dish = pick(pool);
  spinCount += 1;
  await animateReel(pool, dish);
  quipEl.textContent = quipFor(spinCount);
  dishEl.textContent = dish.name;
  blurbEl.textContent = dish.blurb;
  findBtn.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dish.name)}`;
  shareBtn.textContent = SHARE_LABEL;
  resultEl.hidden = false;
  spinBtn.textContent = 'ไม่เอา สุ่มใหม่';
  spinning = false;
  updatePoolNote();
  trackEvent('menu_spin', {
    dish: dish.name,
    meal: filters.meal || 'any',
    type: filters.type || 'any',
    price: filters.price || 'any',
    spin_count: spinCount,
  });
}

document.querySelectorAll('[data-filter]').forEach(group => {
  group.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    filters[group.dataset.filter] = chip.dataset.value;
    group.querySelectorAll('.chip').forEach(c => {
      c.classList.toggle('selected', c === chip);
      c.setAttribute('aria-pressed', String(c === chip));
    });
    updatePoolNote();
  });
});

spinBtn.addEventListener('click', spin);

findBtn.addEventListener('click', () => {
  trackEvent('menu_find_nearby', { dish: dishEl.textContent });
});

shareBtn.addEventListener('click', async () => {
  const dish = dishEl.textContent;
  const text = `วันนี้ HEWKAO สุ่มให้กิน "${dish}" ใครจะไปด้วย`;
  const url = location.origin + location.pathname;
  trackEvent('menu_share', { dish });
  if (navigator.share) {
    try { await navigator.share({ title: 'สุ่มเมนูอาหาร | HEWKAO', text, url }); } catch { /* share sheet dismissed */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    shareBtn.textContent = 'คัดลอกลิงก์แล้ว';
  } catch {
    shareBtn.textContent = 'คัดลอกไม่สำเร็จ';
  }
});

updatePoolNote();
