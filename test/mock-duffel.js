// Local stand-in for the Duffel API, used only by test/run.sh.
const http = require('http');
const future = (d) => new Date(Date.now() + d * 86400000).toISOString();
const seg = (o, d, t) => ({ origin: { iata_code: o, name: o + ' Airport' }, destination: { iata_code: d, name: d + ' Airport' },
  departing_at: t + 'T08:00:00', arriving_at: t + 'T12:00:00', marketing_carrier: { iata_code: 'ZZ' }, marketing_carrier_flight_number: '101' });
let lastSlices = []; let lastPax = [{}];
const routes = {
  'GET /places/suggestions': () => [{ iata_code: 'EVN', name: 'Zvartnots International Airport', city_name: 'Yerevan', type: 'airport' }],
  'POST /air/offer_requests': (b) => {
    lastSlices = b.slices; lastPax = b.passengers;
    const mk = (id, price, instant) => ({ id, total_amount: price, total_currency: 'EUR', owner: { name: 'Duffel Airways' },
      payment_requirements: { requires_instant_payment: instant, payment_required_by: future(2) },
      passengers: b.passengers.map((_, i) => ({ id: 'pas_' + i })),
      slices: b.slices.map((s) => ({ origin: { iata_code: s.origin }, destination: { iata_code: s.destination }, duration: 'PT4H', segments: [seg(s.origin, s.destination, s.departure_date)] })) });
    return { offers: [mk('off_hold', '310.00', false), mk('off_instant', '200.00', true)] };
  },
  'GET /air/offers/off_hold': () => ({ passengers: lastPax.map((_, i) => ({ id: 'pas_' + i })) }),
  'POST /air/orders': (b) => ({ id: 'ord_1', booking_reference: 'RZPNR1', owner: { name: 'Duffel Airways' }, total_amount: '310.00', total_currency: 'EUR',
    payment_status: { payment_required_by: future(2) }, slices: lastSlices.map((s) => ({ segments: [seg(s.origin, s.destination, s.departure_date)] })), _p: b.passengers }),
  'POST /air/order_cancellations': () => ({ id: 'ore_1' }),
  'POST /air/order_cancellations/ore_1/actions/confirm': () => ({ id: 'ore_1' }),
  'POST /stays/search': () => ({ results: [{ id: 'ssr_1' }, { id: 'ssr_2' }] }),
  'POST /stays/search_results/ssr_1/actions/fetch_all_rates': () => ({ accommodation: { name: 'Hotel Free Cancel', rating: 4, location: { address: { line_one: '1 Rue Test', city_name: 'Paris' } },
    rooms: [{ name: 'Double', rates: [{ id: 'rat_free', total_amount: '500', total_currency: 'EUR', cancellation_timeline: [{ before: future(30), refund_amount: '500' }] }] }] } }),
  'POST /stays/search_results/ssr_2/actions/fetch_all_rates': () => ({ accommodation: { name: 'Hotel NonRefundable',
    rooms: [{ name: 'Single', rates: [{ id: 'rat_nr', total_amount: '300', total_currency: 'EUR', cancellation_timeline: [] }] }] } }),
  'POST /stays/quotes': () => ({ id: 'quo_1', total_amount: '500', total_currency: 'EUR', cancellation_timeline: [{ before: future(30), refund_amount: '500' }] }),
  'POST /stays/bookings': () => ({ id: 'bok_1', reference: 'HTL777', check_in_date: '2027-01-10', check_out_date: '2027-01-17',
    accommodation: { name: 'Hotel Free Cancel', location: { address: { line_one: '1 Rue Test', city_name: 'Paris', country_code: 'FR' } } } }),
  'POST /stays/bookings/bok_1/actions/cancel': () => ({ id: 'bok_1', status: 'cancelled' }),
};
http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
    const key = `${req.method} ${req.url.split('?')[0]}`;
    const h = routes[key];
    console.log(key, h ? 'OK' : '404');
    res.writeHead(h ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(h ? { data: h(body ? JSON.parse(body).data : {}) } : { errors: [{ message: 'not found ' + key }] }));
  });
}).listen(4010);
