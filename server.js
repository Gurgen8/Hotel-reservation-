require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const countries = require('./lib/countries');
const { openInBrowser, tripUrl } = require('./lib/opener');
const bot = require('./lib/bot');
const { buildPdf } = require('./lib/pdf');
const { sendBookingEmail } = require('./lib/mail');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const PAY_HOURS = Number(process.env.PAY_HOURS) || 24; // how long the client has to pay
const SERVICE_PRICE = process.env.SERVICE_PRICE || '5000 AMD';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const DB = path.join(__dirname, 'data', 'bookings.json');
const enName = new Intl.DisplayNames(['en'], { type: 'region' });

// ---------- tiny JSON store ----------
function load() {
  try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return {}; }
}
function save(all) { fs.writeFileSync(DB, JSON.stringify(all, null, 2)); }
function update(id, fn) { const all = load(); fn(all[id]); save(all); return all[id]; }

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => res.status(e.status && e.status < 600 ? e.status : 500).json({ error: e.message }));

// ---------- date check ----------
function checkDates(country, checkIn, checkOut) {
  const errors = [];
  const warnings = [];
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const d1 = new Date(checkIn + 'T00:00:00Z');
  const d2 = new Date(checkOut + 'T00:00:00Z');
  if (isNaN(d1) || isNaN(d2)) return { ok: false, errors: ['Укажите обе даты'], warnings };
  const nights = Math.round((d2 - d1) / 86400000);
  if (d1 <= today) errors.push('Дата заезда должна быть в будущем');
  if (nights < 1) errors.push('Дата выезда должна быть позже даты заезда');
  if (nights > 30) errors.push('Не больше 30 ночей');
  if ((d1 - today) / 86400000 > 330) errors.push('Выберите дату заезда в пределах 330 дней');
  if (d1 > today && (d1 - today) / 86400000 < 15 && country.schengen) warnings.push('Шенген: заявку обычно подают не позже чем за 15 дней до поездки');
  return { ok: errors.length === 0, errors, warnings, nights };
}

// ---------- API ----------
app.get('/api/config', (req, res) => res.json({ ready: true, testMode: true, mail: Boolean(process.env.SMTP_HOST) }));
app.get('/api/countries', (req, res) => res.json(countries));

app.post('/api/check', (req, res) => {
  const c = countries.find((x) => x.code === req.body.country);
  if (!c) return res.status(400).json({ error: 'Неизвестная страна' });
  res.json(checkDates(c, req.body.departDate, req.body.returnDate));
});

const NAME = /^[A-Za-z][A-Za-z\- ]*$/;
function badRequest(msg) { const e = new Error(msg); e.status = 400; return e; }

// 1) Client sends country + dates + passengers. Trip.com opens for the operator, who books there.
app.post('/api/book', wrap(async (req, res) => {
  const { country, departDate, returnDate, passengers } = req.body;
  const c = countries.find((x) => x.code === country);
  if (!c) throw badRequest('Неизвестная страна');
  const dates = checkDates(c, departDate, returnDate);
  if (!dates.ok) throw badRequest(dates.errors.join('. '));
  if (!Array.isArray(passengers) || !passengers.length || passengers.length > 4) throw badRequest('Заполните данные путешественников');
  for (const p of passengers) {
    if (!NAME.test(p.givenName || '') || !NAME.test(p.familyName || '') || !p.bornOn) throw badRequest('Имя и фамилия латиницей и дата рождения обязательны');
    if (!['m', 'f'].includes(p.gender)) throw badRequest('Укажите пол');
  }
  if (!/^\S+@\S+\.\S+$/.test(passengers[0].email || '')) throw badRequest('Укажите email');
  if (!/^\+\d{7,15}$/.test(passengers[0].phone || '')) throw badRequest('Телефон в формате +374XXXXXXXX');

  const booking = {
    id: crypto.randomBytes(4).toString('hex').toUpperCase(),
    token: crypto.randomBytes(16).toString('hex'),
    createdAt: new Date().toISOString(),
    country: { ...c, nameEn: enName.of(c.code) },
    departDate, returnDate, passengers,
    status: 'searching',
  };
  const all = load(); all[booking.id] = booking; save(all);
  res.json({ id: booking.id, token: booking.token, manageUrl: manageUrl(booking) });

  // Operator page in the normal browser; Trip.com in the bot (Playwright) or the normal browser.
  if (process.env.AUTO_OPEN !== '0') openInBrowser(`${BASE_URL}/operator.html?id=${booking.id}`);
  openTrip(booking);
}));

// Open Trip.com for a booking: in the bot window (Playwright) or the normal browser.
function openTrip(booking) {
  if (process.env.OPEN_WITH === 'browser') return openInBrowser(tripUrl(booking));
  const done = () => load()[booking.id]?.status !== 'searching';
  bot.assist(booking.id, booking, done)
    .then((r) => r && update(booking.id, (b) => {
      if (b.status !== 'searching') return;
      b.hotel = {
        provider: 'trip.com', url: r.url, name: r.name || 'Hotel (Trip.com)', address: `${b.country.cityEn}, ${b.country.nameEn}`,
        room: r.room, total: r.total, reference: r.reference, checkIn: b.departDate, checkOut: b.returnDate,
        guests: b.passengers.map((p) => `${p.givenName} ${p.familyName}`), status: 'confirmed',
      };
      b.status = 'awaiting_payment';
      b.payBy = new Date(Date.now() + PAY_HOURS * 3600000).toISOString();
    }))
    .catch((e) => console.warn(`[бот ${booking.id}] ${e.message} — завершите заявку на странице оператора`));
}

const manageUrl = (b) => `${BASE_URL}/manage.html?id=${b.id}&t=${b.token}`;

function getOwned(req) {
  const b = load()[req.params.id];
  if (!b || b.token !== (req.query.t || req.body?.t)) {
    const e = new Error('Бронирование не найдено'); e.status = 404; throw e;
  }
  return b;
}

app.get('/api/bookings/:id', wrap(async (req, res) => {
  const { token, ...b } = getOwned(req);
  if (!b.paid && b.hotel) b.hotel = { ...b.hotel, reference: null };
  res.json({ ...b, price: SERVICE_PRICE });
}));

// ---------- operator (only from this computer) ----------
const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
function operatorOnly(req) { if (!isLocal(req)) { const e = new Error('Только с компьютера оператора'); e.status = 403; throw e; } }

app.get('/api/operator', wrap(async (req, res) => {
  operatorOnly(req);
  const list = Object.values(load()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(({ token, ...b }) => ({ ...b, tripUrl: tripUrl(b) }));
  res.json(list);
}));

app.post('/api/operator/:id/open', wrap(async (req, res) => {
  operatorOnly(req);
  const b = load()[req.params.id];
  if (!b) throw badRequest('Нет такой заявки');
  openTrip(b);
  res.json({ ok: true });
}));

// Operator booked on Trip.com → save hotel + booking number → client sees "pay by".
app.post('/api/operator/:id/done', wrap(async (req, res) => {
  operatorOnly(req);
  const { name, address, room, total, reference } = req.body;
  if (!name || !reference) throw badRequest('Укажите название отеля и номер брони');
  const b = update(req.params.id, (x) => {
    if (!x) throw badRequest('Нет такой заявки');
    x.hotel = {
      provider: 'trip.com', name, address: address || `${x.country.cityEn}, ${x.country.nameEn}`, room, total, reference,
      checkIn: x.departDate, checkOut: x.returnDate, guests: x.passengers.map((p) => `${p.givenName} ${p.familyName}`), status: 'confirmed',
    };
    x.status = 'awaiting_payment';
    x.payBy = new Date(Date.now() + PAY_HOURS * 3600000).toISOString();
  });
  res.json({ ok: true, status: b.status });
}));

app.post('/api/operator/:id/fail', wrap(async (req, res) => {
  operatorOnly(req);
  update(req.params.id, (x) => { if (!x) throw badRequest('Нет такой заявки'); x.status = 'failed'; x.error = req.body.reason || 'Не нашли подходящий отель на эти даты'; });
  res.json({ ok: true });
}));

// 2) Client pays (test: no real payment yet) → PDF by email.
app.post('/api/bookings/:id/pay', wrap(async (req, res) => {
  const b = getOwned(req);
  if (b.status !== 'awaiting_payment') throw badRequest('Оплата сейчас недоступна');
  if (new Date(b.payBy) < new Date()) throw badRequest('Срок оплаты истёк');
  const done = update(b.id, (x) => { x.paid = true; x.paidAt = new Date().toISOString(); x.status = 'confirmed'; });
  try { done.mail = await sendBookingEmail(done, await buildPdf(done), manageUrl(done)); } catch (e) { done.mail = { sent: false, reason: e.message }; }
  update(b.id, (x) => { x.mail = done.mail; });
  res.json({ ok: true });
}));

app.get('/api/bookings/:id/pdf', wrap(async (req, res) => {
  const b = getOwned(req);
  if (b.status !== 'confirmed') { const e = new Error('PDF будет доступен после подтверждения брони'); e.status = 402; throw e; }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="hotel-${b.id}.pdf"`);
  res.send(await buildPdf(b));
}));

// The Trip.com booking itself is cancelled by hand (free cancellation) — we log a reminder.
app.post('/api/bookings/:id/cancel', wrap(async (req, res) => {
  const b = getOwned(req);
  if (b.hotel && b.status === 'confirmed') {
    update(b.id, (x) => { x.hotel.status = 'cancelled'; x.status = 'cancelled'; });
    console.warn(`⚠️ Клиент отменил бронь ${b.id}: отмените на Trip.com бронь № ${b.hotel.reference} (${b.hotel.name})`);
  }
  res.json({ ok: true });
}));

app.listen(PORT, (err) => {
  if (err) { console.error(`Не удалось запустить на порту ${PORT}: ${err.message} (сайт уже запущен?)`); process.exit(1); }
  console.log(`VisaBook запущен: ${BASE_URL}`);
  // Unfinished requests (e.g. after a restart): open Trip.com for them again.
  const pending = Object.values(load()).filter((b) => b.status === 'searching');
  if (pending.length) console.log(`Незавершённых заявок: ${pending.length} — открываем Trip.com`);
  pending.forEach(openTrip);
});
