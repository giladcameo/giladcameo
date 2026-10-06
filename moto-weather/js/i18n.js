// All UI strings. Hebrew (RTL) is the default, English is the toggle.
// English copy intentionally avoids em dashes.

export const LANGS = ['he', 'en'];

const DICT = {
  he: {
    'app.name': 'מזג אוויר לדרך',
    'app.title': 'מזג אוויר לדרך | תכנון רכיבה לפי תחזית',
    'app.desc': 'תכנון מסלול לאופנוע עם תחזית מזג אוויר לפי השעה שבה תגיעו לכל נקודה',
    'map.label': 'מפת המסלול',
    'demo.badge': 'מצב הדגמה',
    'sheet.grip': 'הרחבה או כיווץ של הלוח',
    'theme.toggle': 'החלפת ערכת נושא בהירה או כהה',
    'lang.toggle': 'Switch to English',
    'lang.short': 'EN',

    'form.from': 'מוצא',
    'form.to': 'יעד',
    'form.ph': 'כתובת או עיר, ואז Enter',
    'form.depart': 'שעת יציאה',
    'form.myLocation': 'המיקום שלי',
    'form.useLocation': 'שימוש במיקום הנוכחי',
    'form.swap': 'החלפת מוצא ויעד',
    'form.plan': 'בדיקת מסלול',
    'form.edit': 'עריכת המסלול',
    'form.suggestions': 'הצעות כתובת',

    'status.geocode': 'מאתר כתובות',
    'status.route': 'מחשב מסלול',
    'status.weather': 'בודק מזג אוויר לאורך הדרך',

    'verdict.ok': 'פנוי לרכיבה',
    'verdict.caution': 'זהירות בדרך',
    'verdict.danger': 'לא לרכוב',
    'verdict.sub.ok': 'לא צפויות בעיות לאורך המסלול',
    'verdict.sub.caution': '{km} ק״מ עם תנאים מאתגרים',
    'verdict.sub.danger': '{km} ק״מ מסוכנים בדרך',
    'level.ok': 'תקין',
    'level.caution': 'זהירות',
    'level.danger': 'סכנה',

    'stat.gust': 'משב מרבי',
    'stat.temp': 'טמפרטורה נמוכה',
    'stat.rain': 'גשם מצטבר',
    'unit.kmh': 'קמ״ש',
    'unit.km': 'ק״מ',
    'unit.mm': 'מ״מ',
    'unit.c': '°',

    'route.title': 'מסלולים',
    'route.n': 'מסלול {n}',
    'route.fastest': 'המהיר ביותר',
    'route.pick': 'בחירת {name}, {dur}, {dist}, {level}',

    'tl.title': 'לאורך הדרך',
    'tl.start': 'יציאה',
    'tl.end': 'הגעה',
    'tl.point': 'נקודה בק״מ {km}, הגעה בשעה {time}, {wx}, {temp} מעלות, רוח {wind} משבים {gust} קמ״ש, {level}',
    'tl.wind': 'רוח וגשם',
    'tl.noalerts': 'ללא התראות',

    'suggest.title': 'מתי כדאי לצאת',
    'suggest.best': 'הכי טוב',
    'suggest.planned': 'מתוכנן',
    'suggest.loading': 'בודק שעות יציאה אחרות',
    'suggest.error': 'לא הצלחנו לבדוק שעות יציאה אחרות',
    'suggest.clean': 'ללא קטעי סכנה',
    'suggest.danger': '{km} ק״מ בסכנה',
    'suggest.caution': '{km} ק״מ בזהירות',
    'suggest.apply': 'יציאה בשעה {time}, {shift}',
    'suggest.same': 'כמתוכנן',

    'dur.h': '{h} ש׳',
    'dur.hm': '{h} ש׳ {m} ד׳',
    'dur.m': '{m} ד׳',

    'wx.clear': 'בהיר',
    'wx.clear_night': 'לילה בהיר',
    'wx.partly': 'מעונן חלקית',
    'wx.cloud': 'מעונן',
    'wx.fog': 'ערפל',
    'wx.drizzle': 'טפטוף',
    'wx.rain': 'גשם',
    'wx.heavy': 'גשם חזק',
    'wx.snow': 'שלג',
    'wx.thunder': 'סופת רעמים',
    'wx.freezing': 'גשם קופא',

    'reason.rain_light': 'גשם קל',
    'reason.rain_heavy': 'גשם חזק, כביש חלק',
    'reason.thunder': 'סופת רעמים',
    'reason.snow': 'שלג',
    'reason.freezing_rain': 'גשם קופא, סכנת קרח',
    'reason.ice_risk': 'סכנת קרח בכביש',
    'reason.cold': 'קר, כדאי להתלבש בשכבות',
    'reason.heat': 'חום קיצוני',
    'reason.gusts': 'משבי רוח חזקים',
    'reason.strong_gusts': 'משבים מסוכנים לאופנוע',
    'reason.fog': 'ערפל',
    'reason.low_visibility': 'ראות נמוכה',
    'reason.dark': 'חושך',
    'reasons.title': 'מה מעלה את הסיכון',

    'err.no_result': 'לא נמצאה כתובת עבור "{q}". נסו שם עיר או רחוב מלא יותר.',
    'err.route': 'לא הצלחנו לחשב מסלול בין הנקודות. נסו נקודות אחרות.',
    'err.out_of_range': 'התחזית זמינה עד 7 ימים קדימה. בחרו שעת יציאה קרובה יותר.',
    'err.network': 'אין חיבור לשרתי המפה או התחזית. בדקו את הרשת ונסו שוב.',
    'err.offline': 'אין חיבור לאינטרנט. אפשר לתכנן רק כשהרשת זמינה.',
    'err.geo_denied': 'אין הרשאת מיקום. אפשרו גישה למיקום בהגדרות הדפדפן או הקלידו כתובת.',
    'err.geo_unsupported': 'המכשיר לא תומך באיתור מיקום. הקלידו כתובת.',
    'err.geo_failed': 'לא הצלחנו לאתר את המיקום. נסו שוב או הקלידו כתובת.',
    'err.missing': 'הזינו מוצא ויעד.',
    'err.same': 'המוצא והיעד זהים. בחרו יעד אחר.',
    'err.past': 'שעת היציאה כבר עברה. בחרו שעה עתידית.',
    'err.too_far': 'התחזית זמינה עד 7 ימים קדימה בלבד. בחרו שעת יציאה מוקדמת יותר.',
    'err.rate': 'שרת המסלולים עמוס כרגע. נסו שוב בעוד דקה.',
    'err.bad_time': 'שעת היציאה לא תקינה.',
    'err.generic': 'משהו השתבש. נסו שוב.',
    'err.retry': 'נסו שוב',

    'form.deviceTz': 'שעת יציאה לפי שעון המכשיר ({tz})',
    'tz.same': 'כל השעות לפי {tz}',
    'tz.diff': 'השעות בכל נקודה הן שעון מקומי ({tz}). שעת היציאה לפי שעון המכשיר ({dev}).',
    'tz.unknown': 'השעות לפי שעון המכשיר ({dev})',
    'update.available': 'גרסה חדשה זמינה',
    'update.reload': 'עדכון',
    'footer.attr': 'מפה © תורמי OpenStreetMap. מסלול: OSRM. תחזית: Open-Meteo.'
  },

  en: {
    'app.name': 'Ride Weather',
    'app.title': 'Ride Weather | Forecast-aware route planner',
    'app.desc': 'Plan a motorcycle route with the weather you will meet at each point, at the time you will be there',
    'map.label': 'Route map',
    'demo.badge': 'Demo mode',
    'sheet.grip': 'Expand or collapse the panel',
    'theme.toggle': 'Switch between light and dark theme',
    'lang.toggle': 'החלפה לעברית',
    'lang.short': 'עב',

    'form.from': 'From',
    'form.to': 'To',
    'form.ph': 'Address or city, then Enter',
    'form.depart': 'Departure time',
    'form.myLocation': 'My location',
    'form.useLocation': 'Use my current location',
    'form.swap': 'Swap origin and destination',
    'form.plan': 'Check route',
    'form.edit': 'Edit route',
    'form.suggestions': 'Address suggestions',

    'status.geocode': 'Finding addresses',
    'status.route': 'Calculating route',
    'status.weather': 'Checking weather along the way',

    'verdict.ok': 'Clear to ride',
    'verdict.caution': 'Ride with caution',
    'verdict.danger': 'Do not ride',
    'verdict.sub.ok': 'No problems expected along the route',
    'verdict.sub.caution': '{km} km of challenging conditions',
    'verdict.sub.danger': '{km} km of dangerous conditions',
    'level.ok': 'Clear',
    'level.caution': 'Caution',
    'level.danger': 'Danger',

    'stat.gust': 'Peak gust',
    'stat.temp': 'Lowest temp',
    'stat.rain': 'Total rain',
    'unit.kmh': 'km/h',
    'unit.km': 'km',
    'unit.mm': 'mm',
    'unit.c': '°',

    'route.title': 'Routes',
    'route.n': 'Route {n}',
    'route.fastest': 'Fastest',
    'route.pick': 'Choose {name}, {dur}, {dist}, {level}',

    'tl.title': 'Along the way',
    'tl.start': 'Start',
    'tl.end': 'Arrive',
    'tl.point': 'Point at km {km}, arriving {time}, {wx}, {temp} degrees, wind {wind} gusts {gust} km/h, {level}',
    'tl.wind': 'Wind and rain',
    'tl.noalerts': 'No alerts',

    'suggest.title': 'Best time to leave',
    'suggest.best': 'Best',
    'suggest.planned': 'Planned',
    'suggest.loading': 'Checking other departure times',
    'suggest.error': 'Could not check other departure times',
    'suggest.clean': 'No danger stretches',
    'suggest.danger': '{km} km danger',
    'suggest.caution': '{km} km caution',
    'suggest.apply': 'Leave at {time}, {shift}',
    'suggest.same': 'as planned',

    'dur.h': '{h}h',
    'dur.hm': '{h}h {m}m',
    'dur.m': '{m} min',

    'wx.clear': 'Clear',
    'wx.clear_night': 'Clear night',
    'wx.partly': 'Partly cloudy',
    'wx.cloud': 'Overcast',
    'wx.fog': 'Fog',
    'wx.drizzle': 'Drizzle',
    'wx.rain': 'Rain',
    'wx.heavy': 'Heavy rain',
    'wx.snow': 'Snow',
    'wx.thunder': 'Thunderstorm',
    'wx.freezing': 'Freezing rain',

    'reason.rain_light': 'Light rain',
    'reason.rain_heavy': 'Heavy rain, slick road',
    'reason.thunder': 'Thunderstorm',
    'reason.snow': 'Snow',
    'reason.freezing_rain': 'Freezing rain, ice danger',
    'reason.ice_risk': 'Ice on the road',
    'reason.cold': 'Cold, layer up',
    'reason.heat': 'Extreme heat',
    'reason.gusts': 'Strong gusts',
    'reason.strong_gusts': 'Gusts dangerous for a bike',
    'reason.fog': 'Fog',
    'reason.low_visibility': 'Low visibility',
    'reason.dark': 'Darkness',
    'reasons.title': 'What raises the risk',

    'err.no_result': 'No address found for "{q}". Try a fuller city or street name.',
    'err.route': 'Could not find a route between these points. Try other points.',
    'err.out_of_range': 'The forecast covers the next 7 days. Pick a closer departure time.',
    'err.network': 'Cannot reach the map or forecast servers. Check your connection and try again.',
    'err.offline': 'You are offline. Planning needs a network connection.',
    'err.geo_denied': 'Location permission is off. Allow it in your browser settings or type an address.',
    'err.geo_unsupported': 'This device cannot share its location. Type an address.',
    'err.geo_failed': 'Could not get your location. Try again or type an address.',
    'err.missing': 'Enter an origin and a destination.',
    'err.same': 'Origin and destination are the same. Pick a different destination.',
    'err.past': 'That departure time has passed. Pick a time in the future.',
    'err.too_far': 'The forecast only covers the next 7 days. Pick an earlier departure.',
    'err.rate': 'The routing server is busy right now. Try again in a minute.',
    'err.bad_time': 'The departure time is not valid.',
    'err.generic': 'Something went wrong. Try again.',
    'err.retry': 'Try again',

    'form.deviceTz': 'Departure uses your device clock ({tz})',
    'tz.same': 'All times in {tz}',
    'tz.diff': 'Times at each point are local time ({tz}). Departure uses your device clock ({dev}).',
    'tz.unknown': 'Times use your device clock ({dev})',
    'update.available': 'A new version is available',
    'update.reload': 'Update',
    'footer.attr': 'Map data by OpenStreetMap contributors. Routing: OSRM. Forecast: Open-Meteo.'
  }
};

let current = 'he';

export function getLang() { return current; }

export function setLang(lang) {
  current = LANGS.includes(lang) ? lang : 'he';
  const root = document.documentElement;
  root.lang = current;
  root.dir = current === 'he' ? 'rtl' : 'ltr';
  document.title = t('app.title');
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.content = t('app.desc');
  return current;
}

export function t(key, params) {
  let s = (DICT[current] && DICT[current][key]) ?? DICT.en[key] ?? key;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m));
  return s;
}

export function hasKey(key) { return key in DICT.en; }

// Fill static markup: data-i18n="key" for text, data-i18n-attr="attr:key;attr2:key2".
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.dataset.i18nAttr.split(';').forEach((pair) => {
      const [attr, key] = pair.split(':').map((x) => x.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    });
  });
}

export function locale() { return current === 'he' ? 'he-IL' : 'en-GB'; }

export function deviceTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; }
}

// tz is an optional IANA zone name; invalid or missing zones fall back to the device zone.
export function fmtTime(d, tz) {
  const opts = { hour: '2-digit', minute: '2-digit', hour12: false };
  if (tz) { try { return new Intl.DateTimeFormat(locale(), { ...opts, timeZone: tz }).format(d); } catch (e) { /* bad zone */ } }
  return new Intl.DateTimeFormat(locale(), opts).format(d);
}

export function fmtDuration(sec) {
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h > 0 && mm === 0) return t('dur.h', { h });
  return h > 0 ? t('dur.hm', { h, m: mm }) : t('dur.m', { m: mm });
}

export function fmtNum(n, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}
