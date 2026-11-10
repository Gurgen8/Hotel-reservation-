// Popular visa destinations: main airport + city center coordinates for hotel search.
// maxStayDays: usual max stay on a short-stay visa (Schengen = 90).
module.exports = [
  { code: 'FR', cityEn: 'Paris', tripCityId: 192, name: 'Франция', flag: '🇫🇷', city: 'Париж', airport: 'CDG', lat: 48.8566, lng: 2.3522, maxStayDays: 90, schengen: true },
  { code: 'DE', cityEn: 'Berlin', tripCityId: 193, name: 'Германия', flag: '🇩🇪', city: 'Берлин', airport: 'BER', lat: 52.52, lng: 13.405, maxStayDays: 90, schengen: true },
  { code: 'IT', cityEn: 'Rome', tripCityId: 343, name: 'Италия', flag: '🇮🇹', city: 'Рим', airport: 'FCO', lat: 41.9028, lng: 12.4964, maxStayDays: 90, schengen: true },
  { code: 'ES', cityEn: 'Madrid', tripCityId: 357, name: 'Испания', flag: '🇪🇸', city: 'Мадрид', airport: 'MAD', lat: 40.4168, lng: -3.7038, maxStayDays: 90, schengen: true },
  { code: 'NL', cityEn: 'Amsterdam', tripCityId: 176, name: 'Нидерланды', flag: '🇳🇱', city: 'Амстердам', airport: 'AMS', lat: 52.3676, lng: 4.9041, maxStayDays: 90, schengen: true },
  { code: 'GR', cityEn: 'Athens', tripCityId: 710, name: 'Греция', flag: '🇬🇷', city: 'Афины', airport: 'ATH', lat: 37.9838, lng: 23.7275, maxStayDays: 90, schengen: true },
  { code: 'CZ', cityEn: 'Prague', tripCityId: 1288, name: 'Чехия', flag: '🇨🇿', city: 'Прага', airport: 'PRG', lat: 50.0755, lng: 14.4378, maxStayDays: 90, schengen: true },
  { code: 'AT', cityEn: 'Vienna', tripCityId: 651, name: 'Австрия', flag: '🇦🇹', city: 'Вена', airport: 'VIE', lat: 48.2082, lng: 16.3738, maxStayDays: 90, schengen: true },
  { code: 'CH', cityEn: 'Zurich', tripCityId: 434, name: 'Швейцария', flag: '🇨🇭', city: 'Цюрих', airport: 'ZRH', lat: 47.3769, lng: 8.5417, maxStayDays: 90, schengen: true },
  { code: 'PL', cityEn: 'Warsaw', tripCityId: 293, name: 'Польша', flag: '🇵🇱', city: 'Варшава', airport: 'WAW', lat: 52.2297, lng: 21.0122, maxStayDays: 90, schengen: true },
  { code: 'PT', cityEn: 'Lisbon', tripCityId: 1231, name: 'Португалия', flag: '🇵🇹', city: 'Лиссабон', airport: 'LIS', lat: 38.7223, lng: -9.1393, maxStayDays: 90, schengen: true },
  { code: 'GB', cityEn: 'London', tripCityId: 338, name: 'Великобритания', flag: '🇬🇧', city: 'Лондон', airport: 'LHR', lat: 51.5074, lng: -0.1278, maxStayDays: 180 },
  { code: 'US', cityEn: 'New York', tripCityId: 633, name: 'США', flag: '🇺🇸', city: 'Нью-Йорк', airport: 'JFK', lat: 40.7128, lng: -74.006, maxStayDays: 180 },
  { code: 'CA', cityEn: 'Toronto', tripCityId: 461, name: 'Канада', flag: '🇨🇦', city: 'Торонто', airport: 'YYZ', lat: 43.6532, lng: -79.3832, maxStayDays: 180 },
  { code: 'JP', cityEn: 'Tokyo', tripCityId: 228, name: 'Япония', flag: '🇯🇵', city: 'Токио', airport: 'HND', lat: 35.6762, lng: 139.6503, maxStayDays: 90 },
  { code: 'KR', cityEn: 'Seoul', tripCityId: 274, name: 'Южная Корея', flag: '🇰🇷', city: 'Сеул', airport: 'ICN', lat: 37.5665, lng: 126.978, maxStayDays: 90 },
  { code: 'CN', cityEn: 'Beijing', tripCityId: 1, name: 'Китай', flag: '🇨🇳', city: 'Пекин', airport: 'PEK', lat: 39.9042, lng: 116.4074, maxStayDays: 30 },
  { code: 'AE', cityEn: 'Dubai', tripCityId: 220, name: 'ОАЭ', flag: '🇦🇪', city: 'Дубай', airport: 'DXB', lat: 25.2048, lng: 55.2708, maxStayDays: 90 },
  { code: 'AU', cityEn: 'Sydney', tripCityId: 501, name: 'Австралия', flag: '🇦🇺', city: 'Сидней', airport: 'SYD', lat: -33.8688, lng: 151.2093, maxStayDays: 90 },
];
