// Opens pages in the operator's normal browser (no automation, so Trip.com filters work).
const { execFile } = require('child_process');

function openInBrowser(url) {
  const cmd = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : ['xdg-open', [url]];
  execFile(cmd[0], cmd[1], (err) => { if (err) console.warn('Не удалось открыть браузер:', err.message); });
}

// Trip.com list filters, as they appear in the URL after ticking them on the site:
// 80~0~1*80*0 = Free cancellation, 7~1*7*1 = Pay at Hotel. Override with TRIP_FILTERS in .env.
const FILTERS = process.env.TRIP_FILTERS || '80~0~1*80*0,7~1*7*1';

// Trip.com search for this booking: city, dates, guests + filters.
function tripUrl(b) {
  const adults = b.passengers.length;
  const rooms = Math.max(1, Math.ceil(adults / 2));
  return `https://www.trip.com/hotels/list?city=${b.country.tripCityId}&checkin=${b.departDate}&checkout=${b.returnDate}`
    + `&adult=${adults}&crn=${rooms}&curr=EUR&locale=en-US&listFilters=${encodeURIComponent(FILTERS)}`;
}

module.exports = { openInBrowser, tripUrl };
