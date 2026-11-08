import { AIRPORTS, AIRPORT_SOURCE_TEXT } from '../../data/airports.ts';

export type Airport = { iata: string; name: string; country: string; lat: number; lon: number };

export const AIRPORT_SOURCE = () => AIRPORT_SOURCE_TEXT;

export function airport(iata: string): Airport | null {
  const code = iata.trim().toUpperCase();
  const row = AIRPORTS[code];
  if (!row) return null;
  return { iata: code, name: row[0], country: row[1], lat: row[2], lon: row[3] };
}

/** Great-circle distance in km (haversine, mean Earth radius 6371 km), rounded to the nearest km. */
export function greatCircleKm(a: Airport, b: Airport): number {
  const R = 6371.0;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

// EU member states (ISO 3166-1), plus territories OurAirports lists under their own codes but which are
// EU outermost regions. EEA states and Switzerland apply Regulation 261/2004 by agreement.
const EU = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'];
const EU_OUTERMOST = ['RE','GP','MQ','GF','YT','MF'];
const EEA_CH = ['IS','NO','LI','CH'];

export const inEU261Territory = (country: string) =>
  EU.includes(country) || EU_OUTERMOST.includes(country) || EEA_CH.includes(country);
export const inUK = (country: string) => country === 'GB';
export const inIsrael = (country: string) => country === 'IL';
