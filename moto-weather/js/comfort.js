// Rider comfort: wind chill at riding speed. Dependency-free ES module (browser and Node 18+).

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Wind chill (Environment Canada / NWS formula, metric):
 * 13.12 + 0.6215 T - 11.37 v^0.16 + 0.3965 T v^0.16, T in deg C, v = airspeed in km/h.
 * Only defined for T <= 10 C and v >= 4.8 km/h; outside that range the air temperature is returned.
 */
export function windChillC(tempC, airspeedKmh) {
  if (!isNum(tempC)) return tempC;
  if (!isNum(airspeedKmh) || tempC > 10 || airspeedKmh < 4.8) return tempC;
  const v16 = Math.pow(airspeedKmh, 0.16);
  return 13.12 + 0.6215 * tempC - 11.37 * v16 + 0.3965 * tempC * v16;
}

/**
 * Feels-like temperature for a rider. Effective airspeed is sqrt(riding^2 + wind^2),
 * which is conservative (it assumes the wind is a pure headwind component in quadrature).
 * Returns null when the sample has no air temperature.
 */
export function riderFeelsLikeC(sample, ridingSpeedKmh = 90) {
  const t = sample && sample.tempC;
  if (!isNum(t)) return null;
  const riding = isNum(ridingSpeedKmh) && ridingSpeedKmh > 0 ? ridingSpeedKmh : 0;
  const wind = sample && isNum(sample.windKmh) ? Math.max(0, sample.windKmh) : 0;
  return windChillC(t, Math.sqrt(riding * riding + wind * wind));
}
