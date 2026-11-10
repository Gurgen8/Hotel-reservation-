// Waiting screen while the hotel is being booked. Polls the booking until its status changes.
function waitForHotel({ id, t, city }) {
  const box = document.getElementById('bot');
  const steps = [`Ищем отели · ${city}`, 'Только бесплатная отмена', 'Оплата в отеле — без предоплаты', 'Выбираем лучший вариант', 'Бронируем на ваше имя'];
  box.innerHTML = `
    <div class="bot-card" style="width:min(460px,100%)">
      <div class="bot-head"><div class="bot-face">🤖</div><div><b>Подбираем отель</b><small>Обычно 5–15 минут · страницу можно не закрывать</small></div></div>
      <ol class="bot-steps" style="margin-top:18px">${steps.map((s) => `<li>${s}</li>`).join('')}</ol>
      <div class="bot-bar"><i id="botBar"></i></div>
    </div>`;
  box.classList.remove('hidden');
  const items = [...box.querySelectorAll('li')];
  let i = 0;
  // Steps advance slowly; the last one keeps spinning until the booking is ready.
  const anim = setInterval(() => {
    items.forEach((li, k) => (li.className = k < i ? 'ok' : k === i ? 'run' : ''));
    document.getElementById('botBar').style.width = `${Math.min(90, (i + 1) * 18)}%`;
    if (i < items.length - 1) i++;
  }, 4000);
  items[0].className = 'run';

  return new Promise((resolve) => {
    const tick = async () => {
      try {
        const b = await (await fetch(`/api/bookings/${id}?t=${t}`)).json();
        if (b.status && b.status !== 'searching') {
          clearInterval(anim);
          items.forEach((li) => (li.className = 'ok'));
          document.getElementById('botBar').style.width = '100%';
          return setTimeout(() => { box.classList.add('hidden'); resolve(b); }, 900);
        }
      } catch {}
      setTimeout(tick, 4000);
    };
    tick();
  });
}
