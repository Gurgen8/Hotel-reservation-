// Booking assistant on Trip.com (Playwright, visible Chrome window).
// The bot opens Trip.com for the client's city/dates/guests with filters in the URL.
// The operator picks the hotel by hand. On the "Your Details" page the bot fills in
// the guest data; after "Book now" it reads the booking number.
const { chromium } = require('playwright');
const { tripUrl } = require('./opener');

const HEADLESS = process.env.BOT_HEADLESS === '1';
const TIMEOUT_MIN = Number(process.env.BOT_TIMEOUT_MIN) || 60; // how long to wait for the operator

let browserPromise = null;
function browser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: HEADLESS, channel: 'chrome' }).catch(() => chromium.launch({ headless: HEADLESS }));
    // If the window is closed (or crashes), start a fresh one next time.
    browserPromise.then((b) => b.on('disconnected', () => (browserPromise = null)), () => (browserPromise = null));
  }
  return browserPromise;
}

// One client at a time, so the operator works in a single window.
let queue = Promise.resolve();
function enqueue(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Your Trip.com sign-in is remembered between windows (sign in once in the bot window).
const fs = require('fs');
const path = require('path');
const SESSION = path.join(__dirname, '..', 'data', 'trip-session.json');
const saveSession = (ctx) => ctx.storageState({ path: SESSION }).catch(() => {});

// Fill the "Who's staying?" form. Returns true once the main fields are filled.
async function fillGuestForm(page, guest) {
  const fill = async (label, value) => {
    const loc = page.getByLabel(label, { exact: false }).first();
    if (!(await loc.count())) return false;
    if ((await loc.inputValue().catch(() => '')) === value) return true;
    await loc.fill(value);
    return true;
  };
  const phone = guest.phone.replace(/^\+374/, '').replace(/^\+/, '');
  const ok = [
    await fill('First name', guest.givenName.toUpperCase()),
    await fill('Last name', guest.familyName.toUpperCase()),
    await fill('Email', guest.email),
    await fill('Phone number', phone),
  ];
  return ok.every(Boolean);
}

// Read what we can from the "Your Details" page (hotel + room).
async function readDetails(page) {
  return page.evaluate(() => {
    const t = document.body.innerText;
    const name = (t.match(/\n([^\n]{4,140})\n[^\n]*\n?\s*\d(?:\.\d)?\/10/) || [])[1];
    const room = (t.match(/reviews\n+([^\n]{3,80})\n/) || [])[1];
    const total = (t.match(/(?:Pay at Hotel|Total)[^\n]*\n?\s*≈?\s*((?:US\$|€|EUR|CNY|AMD|\$)\s?[\d,.]+)/) || [])[1];
    return { name: name && name.trim(), room: room && room.trim(), total };
  });
}

// Booking confirmation page → booking number.
async function readConfirmation(page) {
  return page.evaluate(() => {
    const t = document.body.innerText;
    if (!/booking (is )?confirmed|booking (no|number|id)|reservation confirmed|order (no|number)/i.test(t)) return null;
    const ref = (t.match(/(?:Booking|Order|Reservation)\s*(?:No\.?|number|ID)\s*:?\s*([A-Z0-9]{6,})/i) || [])[1];
    return ref ? { reference: ref } : null;
  });
}

// Open Trip.com for this booking and wait until the operator completes it.
function assist(id, b, stop) {
  return enqueue(async () => {
    const ctx = await (await browser()).newContext({
      locale: 'en-US', viewport: { width: 1280, height: 860 },
      storageState: fs.existsSync(SESSION) ? SESSION : undefined,
    });
    const page = await ctx.newPage();
    // Hotel links open in new tabs: always follow the newest tab.
    let current = page;
    ctx.on('page', (p) => { current = p; p.bringToFront().catch(() => {}); });
    // No screenshots here: they make the visible window flicker.
    let last = '';
    const step = async (text) => { if (text !== last) console.log(`[бот ${id}] ${text}`); last = text; };

    try {
      await step(`Открываем Trip.com · ${b.country.city}`);
      await page.goto(tripUrl(b), { waitUntil: 'domcontentloaded', timeout: 60000 });
      await step('Выбираем отель: бесплатная отмена + оплата в отеле');

      // Open the first hotel from the list so its details are visible right away.
      try {
        const first = page.locator('a[href*="/hotels/detail"]').first();
        await first.waitFor({ state: 'visible', timeout: 60000 });
        const href = await first.getAttribute('href').then((h) => new URL(h, page.url()).href);
        await step('Открываем первый отель из списка');
        await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 60000 });
      } catch {
        await step('Список отелей не загрузился — выберите отель вручную');
      }

      let filled = false;
      let details = {};
      const deadline = Date.now() + TIMEOUT_MIN * 60000;
      while (Date.now() < deadline) {
        if (ctx.pages().length === 0) throw new Error('Окно Trip.com закрыли до завершения брони');
        const url = current.url();
        if (/\/hotels\/book/i.test(url)) {
          const conf = await readConfirmation(current).catch(() => null);
          if (conf) {
            await step(`Бронь подтверждена ✓ · № ${conf.reference}`);
            return { ...details, ...conf, url };
          }
          if (!filled) {
            await step('Заполняем данные гостя');
            filled = await fillGuestForm(current, b.passengers[0]).catch(() => false);
            const d = await readDetails(current).catch(() => ({}));
            details = { ...details, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v)) };
            if (filled) await step('Данные заполнены · подтверждаем бронь');
          }
        } else if (/\/hotels\/detail/i.test(url)) {
          await step('Выбираем номер');
        }
        // Some confirmation pages live outside /hotels/book.
        if (!/\/hotels\/(list|detail)/i.test(url)) {
          const conf = await readConfirmation(current).catch(() => null);
          if (conf) { await step(`Бронь подтверждена ✓ · № ${conf.reference}`); return { ...details, ...conf, url }; }
        }
        if (stop?.()) return null; // operator finished it by hand
        if (/\/account\/signin/i.test(url)) await step('Trip.com просит войти — войдите в аккаунт в этом окне (один раз)');
        else await saveSession(ctx);
        await sleep(2000);
      }
      throw new Error('Время ожидания брони истекло');
    } finally {
      await saveSession(ctx);
      await sleep(3000);
      await ctx.close().catch(() => {});
    }
  });
}

module.exports = { assist };
