const nodemailer = require('nodemailer');

function transporter() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendBookingEmail(booking, pdf, manageUrl) {
  const t = transporter();
  if (!t) return { sent: false, reason: 'SMTP не настроен' };
  const lines = [];
  if (booking.flight) lines.push(`✈️ Авиабронь: ${booking.flight.airline}, PNR <b>${booking.flight.pnr}</b> (держится до ${booking.flight.payBy || '—'})`);
  if (booking.hotel) lines.push(`🏨 Отель: ${booking.hotel.name}, номер брони <b>${booking.hotel.reference}</b> (бесплатная отмена до ${booking.hotel.freeCancelUntil || '—'})`);
  await t.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: booking.passengers[0].email,
    subject: `Ваше бронирование для визы — ${booking.country.city}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:560px">
        <h2 style="color:#4f46e5">Бронирование готово</h2>
        <p>${lines.join('<br>')}</p>
        <p>Маршрутная квитанция во вложении (PDF).</p>
        <p>Оплатить или отменить бронь можно здесь:<br><a href="${manageUrl}">${manageUrl}</a></p>
      </div>`,
    attachments: [{ filename: `itinerary-${booking.id}.pdf`, content: pdf }],
  });
  return { sent: true };
}

module.exports = { sendBookingEmail };
