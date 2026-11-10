// Builds an itinerary PDF (in English, as visa centers expect) from real booking data.
const PDFDocument = require('pdfkit');

const INK = '#0f172a';
const MUTED = '#64748b';
const ACCENT = '#4f46e5';

function fmtDateTime(iso) {
  if (!iso) return '-';
  return iso.replace('T', ' ').slice(0, 16);
}
function fmtDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toUTCString().slice(5, 16);
}

function buildPdf(booking) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.rect(0, 0, doc.page.width, 90).fill(ACCENT);
    doc.fill('#fff').fontSize(22).font('Helvetica-Bold').text('Travel Itinerary', 50, 30);
    doc.fontSize(10).font('Helvetica').text(`Issued ${fmtDate(booking.createdAt)}  ·  Ref ${booking.id}`, 50, 60);
    doc.moveDown(3).fill(INK);

    // Test bookings must never pass as real documents.
    if (booking.hotel?.test) {
      doc.rect(50, 100, 495, 34).fill('#dc2626');
      doc.fill('#fff').font('Helvetica-Bold').fontSize(13).text('TEST - NOT A REAL RESERVATION - DO NOT SUBMIT', 50, 111, { width: 495, align: 'center' });
      doc.fill(INK).font('Helvetica').fontSize(11);
      doc.y = 145;
    }

    const section = (title) => {
      doc.moveDown(1).font('Helvetica-Bold').fontSize(13).fill(ACCENT).text(title.toUpperCase(), 50);
      doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor('#e2e8f0').stroke();
      doc.moveDown(0.6).fill(INK).font('Helvetica').fontSize(11);
    };
    const row = (label, value) => {
      const y = doc.y;
      doc.fill(MUTED).text(label, 50, y, { width: 150 });
      doc.fill(INK).text(String(value ?? '-'), 200, y, { width: 345 });
      doc.moveDown(0.3);
    };

    section('Travellers');
    booking.passengers.forEach((p, i) => row(`Passenger ${i + 1}`, `${p.familyName.toUpperCase()} / ${p.givenName.toUpperCase()}  (DOB ${p.bornOn})`));
    row("Destination", `${booking.country.cityEn || booking.country.city}, ${booking.country.nameEn || booking.country.code}`);
    row('Travel dates', `${booking.departDate} - ${booking.returnDate}`);

    if (booking.flight) {
      const f = booking.flight;
      section('Flight reservation');
      row('Booking reference (PNR)', f.pnr);
      row('Airline', f.airline);
      row('Status', f.status === 'cancelled' ? 'CANCELLED' : 'Reserved (on hold)');
      row('Fare', `${f.total} ${f.currency}`);
      if (f.payBy) row('Hold valid until', fmtDateTime(f.payBy) + ' UTC');
      f.slices.forEach((s, si) => {
        doc.moveDown(0.4).font('Helvetica-Bold').text(si === 0 ? 'Outbound' : 'Return', 50).font('Helvetica');
        s.segments.forEach((seg) => {
          row(seg.flight, `${seg.from} ${fmtDateTime(seg.departAt)}  ->  ${seg.to} ${fmtDateTime(seg.arriveAt)}`);
        });
      });
    }

    if (booking.hotel) {
      const h = booking.hotel;
      section('Hotel reservation');
      row('Confirmation number', h.reference);
      row('Hotel', h.name);
      row('Address', h.address);
      if (h.phone) row('Hotel phone', h.phone);
      row('Check-in', h.checkIn);
      row('Check-out', h.checkOut);
      row('Guests', h.guests.join(', '));
      if (h.room) row('Room', h.room);
      row('Status', h.status === 'cancelled' ? 'CANCELLED' : h.test ? 'TEST (not booked)' : 'Confirmed');
      row('Total', `${h.total} ${h.currency}`);
      if (h.freeCancelUntil) row('Free cancellation until', fmtDateTime(h.freeCancelUntil) + ' UTC');
    }

    doc.moveDown(2).fontSize(9).fill(MUTED).text(
      booking.hotel?.test ? 'TEST DOCUMENT. No reservation was made. Not valid for visa applications.' : 'The reservation above is held directly with the hotel and can be verified with them using the reference shown.',
      50, doc.y, { width: 495 }
    );
    doc.end();
  });
}

module.exports = { buildPdf };
