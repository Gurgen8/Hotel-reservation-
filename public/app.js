const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { country: null };

async function api(url, body) {
  const res = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Ошибка');
  return json;
}
const loader = (t) => `<div class="loader"><div class="spin"></div>${t}</div>`;
const msg = (type, t) => `<div class="msg ${type}">${esc(t)}</div>`;

// ---------- init ----------
(async () => {
  const cfg = await api('/api/config');
  $('mode').textContent = !cfg.ready ? '⚠️ Нужен ключ Duffel' : cfg.testMode ? '🧪 Тестовый режим' : '● Работает';

  const list = await api('/api/countries');
  $('countries').innerHTML = list.map((c) => `
    <button class="country" data-code="${c.code}">
      <div class="f">${c.flag}</div><b>${esc(c.name)}</b><small>${esc(c.city)}${c.schengen ? ' · Шенген' : ''}</small>
    </button>`).join('');
  $('countries').onclick = (e) => {
    const b = e.target.closest('.country'); if (!b) return;
    document.querySelectorAll('.country').forEach((x) => x.classList.remove('sel'));
    b.classList.add('sel');
    state.country = list.find((c) => c.code === b.dataset.code);
  };
})();

// ---------- passenger forms ----------
function renderPax() {
  const n = Number($('adults').value);
  const forms = $('paxForms');
  while (forms.children.length > n) forms.lastElementChild.remove();
  for (let i = forms.children.length; i < n; i++) {
    forms.insertAdjacentHTML('beforeend', `
      <div class="pax">
        <h3>Путешественник ${i + 1}</h3>
        <div class="row">
          <div><label>Имя (Given name)</label><input name="givenName" placeholder="IVAN"></div>
          <div><label>Фамилия (Surname)</label><input name="familyName" placeholder="PETROV"></div>
          <div><label>Дата рождения</label><input type="date" name="bornOn"></div>
          <div><label>Пол</label><select name="gender"><option value="m">Мужской</option><option value="f">Женский</option></select></div>
        </div>
      </div>`);
  }
}
$('adults').onchange = renderPax;
renderPax();

// ---------- book ----------
$('book').onclick = async () => {
  const err = (t) => ($('bookMsg').innerHTML = msg('err', t));
  if (!state.country) return err('Выберите страну');
  const departDate = $('departDate').value, returnDate = $('returnDate').value;
  if (!departDate || !returnDate) return err('Укажите даты заезда и выезда');

  const email = $('email').value.trim(), phone = $('phone').value.replace(/[\s\-()]/g, '');
  const passengers = [...document.querySelectorAll('.pax')].map((p) => {
    const v = (n) => p.querySelector(`[name=${n}]`).value.trim();
    return { givenName: v('givenName'), familyName: v('familyName'), bornOn: v('bornOn'), gender: v('gender'), email, phone };
  });
  if (passengers.some((p) => !/^[A-Za-z][A-Za-z\- ]*$/.test(p.givenName) || !/^[A-Za-z][A-Za-z\- ]*$/.test(p.familyName) || !p.bornOn))
    return err('Заполните имя и фамилию латиницей и дату рождения');
  if (!/^\S+@\S+\.\S+$/.test(email)) return err('Укажите email');
  if (!/^\+\d{7,15}$/.test(phone)) return err('Телефон в формате +374XXXXXXXX');

  const trip = { country: state.country.code, departDate, returnDate };
  try {
    const check = await api('/api/check', trip);
    if (!check.ok) return err(check.errors.join('. '));
  } catch (e) { return err(e.message); }

  $('book').disabled = true;
  $('bookMsg').innerHTML = '';
  try {
    const r = await api('/api/book', { ...trip, passengers });
    location.href = r.manageUrl.replace(/^https?:\/\/[^/]+/, '');
  } catch (e) {
    err(e.message);
    $('book').disabled = false;
  }
};

// Flights are not available yet.
$('flightSoon').onclick = () => ($('soonMsg').innerHTML = msg('warn', '✈️ Бронь авиабилетов скоро появится. Пока доступна только бронь отеля.'));
