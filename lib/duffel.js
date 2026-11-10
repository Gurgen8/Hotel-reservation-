// Thin client for the Duffel API (flights + stays). Docs: https://duffel.com/docs
const BASE = process.env.DUFFEL_BASE || 'https://api.duffel.com';

function token() {
  const t = process.env.DUFFEL_TOKEN;
  if (!t) {
    const err = new Error('DUFFEL_TOKEN не задан в .env — без него бронирование невозможно.');
    err.status = 503;
    throw err;
  }
  return t;
}

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Duffel-Version': 'v2',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify({ data: body }) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.errors?.map((e) => e.message || e.title).join('; ') || res.statusText;
    const err = new Error(`Duffel: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json.data;
}

// ---------- Flights ----------

async function searchPlaces(query) {
  const data = await call('GET', `/places/suggestions?query=${encodeURIComponent(query)}`);
  return data
    .filter((p) => p.iata_code)
    .map((p) => ({ code: p.iata_code, name: p.name, city: p.city_name || p.name, type: p.type }));
}

async function searchFlights({ origin, destination, departDate, returnDate, adults }) {
  const slices = [{ origin, destination, departure_date: departDate }];
  if (returnDate) slices.push({ origin: destination, destination: origin, departure_date: returnDate });
  const req = await call('POST', '/air/offer_requests?return_offers=true&supplier_timeout=20000', {
    slices,
    passengers: Array.from({ length: adults }, () => ({ type: 'adult' })),
    cabin_class: 'economy',
  });

  // Only offers that can be held without paying now.
  return req.offers
    .filter((o) => o.payment_requirements && o.payment_requirements.requires_instant_payment === false)
    .sort((a, b) => Number(a.total_amount) - Number(b.total_amount))
    .slice(0, 15)
    .map((o) => ({
      id: o.id,
      airline: o.owner.name,
      airlineLogo: o.owner.logo_symbol_url,
      total: o.total_amount,
      currency: o.total_currency,
      payBy: o.payment_requirements.payment_required_by,
      passengerIds: o.passengers.map((p) => p.id),
      slices: o.slices.map((s) => ({
        from: s.origin.iata_code,
        to: s.destination.iata_code,
        duration: s.duration,
        segments: s.segments.map((seg) => ({
          from: seg.origin.iata_code,
          to: seg.destination.iata_code,
          departAt: seg.departing_at,
          arriveAt: seg.arriving_at,
          flight: `${seg.marketing_carrier.iata_code}${seg.marketing_carrier_flight_number}`,
        })),
      })),
    }));
}

async function holdFlight(offerId, passengers) {
  const offer = await call('GET', `/air/offers/${offerId}`);
  if (offer.passengers.length !== passengers.length) {
    const err = new Error('Число пассажиров изменилось — выполните поиск рейсов заново.');
    err.status = 400;
    throw err;
  }
  const order = await call('POST', '/air/orders', {
    type: 'hold',
    selected_offers: [offerId],
    passengers: offer.passengers.map((p, i) => ({
      id: p.id,
      title: passengers[i].gender === 'f' ? 'ms' : 'mr',
      gender: passengers[i].gender,
      given_name: passengers[i].givenName,
      family_name: passengers[i].familyName,
      born_on: passengers[i].bornOn,
      email: passengers[0].email,
      phone_number: passengers[0].phone,
    })),
  });
  return {
    orderId: order.id,
    pnr: order.booking_reference,
    airline: order.owner.name,
    total: order.total_amount,
    currency: order.total_currency,
    payBy: order.payment_status?.payment_required_by,
    slices: order.slices.map((s) => ({
      segments: s.segments.map((seg) => ({
        from: seg.origin.iata_code,
        fromName: seg.origin.name,
        to: seg.destination.iata_code,
        toName: seg.destination.name,
        departAt: seg.departing_at,
        arriveAt: seg.arriving_at,
        flight: `${seg.marketing_carrier.iata_code}${seg.marketing_carrier_flight_number}`,
      })),
    })),
  };
}

async function cancelFlight(orderId) {
  const c = await call('POST', '/air/order_cancellations', { order_id: orderId });
  await call('POST', `/air/order_cancellations/${c.id}/actions/confirm`);
}

// ---------- Hotels (Stays) ----------

function isFreeCancellation(rate) {
  const tl = rate.cancellation_timeline || [];
  return tl.length > 0 && tl.some((t) => Number(t.refund_amount) >= Number(rate.total_amount) && new Date(t.before) > new Date());
}

async function searchHotels({ lat, lng, checkIn, checkOut, adults }) {
  const rooms = Math.max(1, Math.ceil(adults / 2));
  const search = await call('POST', '/stays/search', {
    rooms,
    location: { radius: 5, geographic_coordinates: { latitude: lat, longitude: lng } },
    check_in_date: checkIn,
    check_out_date: checkOut,
    guests: Array.from({ length: adults }, () => ({ type: 'adult' })),
  });

  const results = (search.results || []).slice(0, 12);
  const hotels = [];
  for (const r of results) {
    try {
      const full = await call('POST', `/stays/search_results/${r.id}/actions/fetch_all_rates`);
      const acc = full.accommodation;
      const rates = acc.rooms
        .flatMap((room) => room.rates.map((rate) => ({ room: room.name, rate })))
        .filter((x) => isFreeCancellation(x.rate))
        .sort((a, b) => Number(a.rate.total_amount) - Number(b.rate.total_amount));
      if (!rates.length) continue;
      const best = rates[0];
      const freeUntil = best.rate.cancellation_timeline
        .filter((t) => Number(t.refund_amount) >= Number(best.rate.total_amount))
        .map((t) => t.before)
        .sort()
        .pop();
      hotels.push({
        rateId: best.rate.id,
        name: acc.name,
        stars: acc.rating,
        address: [acc.location?.address?.line_one, acc.location?.address?.city_name].filter(Boolean).join(', '),
        photo: acc.photos?.[0]?.url,
        room: best.room,
        total: best.rate.total_amount,
        currency: best.rate.total_currency,
        freeCancelUntil: freeUntil,
      });
    } catch (e) {
      // skip hotels whose rates fail to load
    }
  }
  return hotels;
}

async function bookHotel(rateId, guests, contact) {
  const quote = await call('POST', '/stays/quotes', { rate_id: rateId });
  const b = await call('POST', '/stays/bookings', {
    quote_id: quote.id,
    guests: guests.map((g) => ({ given_name: g.givenName, family_name: g.familyName })),
    email: contact.email,
    phone_number: contact.phone,
  });
  const acc = b.accommodation;
  const tl = quote.cancellation_timeline || [];
  return {
    bookingId: b.id,
    reference: b.reference || b.booking_reference,
    name: acc.name,
    address: [acc.location?.address?.line_one, acc.location?.address?.city_name, acc.location?.address?.country_code].filter(Boolean).join(', '),
    phone: acc.phone_number,
    checkIn: b.check_in_date,
    checkOut: b.check_out_date,
    total: quote.total_amount,
    currency: quote.total_currency,
    freeCancelUntil: tl.map((t) => t.before).sort().pop(),
    guests: guests.map((g) => `${g.givenName} ${g.familyName}`),
  };
}

async function cancelHotel(bookingId) {
  await call('POST', `/stays/bookings/${bookingId}/actions/cancel`);
}

module.exports = { searchPlaces, searchFlights, holdFlight, cancelFlight, searchHotels, bookHotel, cancelHotel };
