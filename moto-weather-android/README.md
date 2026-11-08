# מזג אוויר לדרך: אפליקציית אנדרואיד

עטיפה נייטיבית (Capacitor) של אפליקציית הרשת שבתיקייה `../moto-weather`. זה אותו קוד בדיוק, ארוז כ־APK עם איקון משלו, הרשאת מיקום נייטיבית ומסך פתיחה. Leaflet נארז בפנים, כך שהאפליקציה עולה גם בלי CDN. התחזית, החיפוש והניתוב עדיין דורשים רשת.

## להתקין בטלפון

1. בטלפון, פתח את הקישור: https://github.com/giladcameo/giladcameo/releases/download/moto-weather-android/moto-weather.apk
2. אשר "התקנה ממקור לא ידוע" לדפדפן שהורדת איתו (אנדרואיד שואל פעם אחת).
3. פתח את הקובץ ולחץ "התקן".

כל מיזוג לענף הראשי שנוגע ב־`moto-weather/` או בתיקייה הזו בונה APK חדש ומחליף את הקובץ בקישור. אפשר להתקין אותו מעל הגרסה הקודמת בלי למחוק, כי כל הבניות חתומות באותו מפתח.

## איך זה בנוי

- `scripts/prepare-www.mjs` מעתיק את `../moto-weather` אל `www/` (בלי ה־service worker), ומחליף את טעינת Leaflet מ־unpkg בעותק מקומי.
- `capacitor.config.json`: שם האפליקציה, מזהה החבילה `com.gcameo.motoweather`, ו־User-Agent שמזהה את האפליקציה מול Nominatim ושרתי המפה (נדרש לפי מדיניות השימוש שלהם).
- `android/`: פרויקט Android Studio. `AndroidManifest.xml` כולל הרשאות מיקום.
- `.github/workflows/moto-weather-android.yml` (בשורש הריפו): בונה APK ב־GitHub, מאמת חתימה ותוכן, מעלה אותו כ־artifact ומעדכן את ה־release `moto-weather-android`.

## לבנות מקומית

```bash
npm ci
npm run sync          # מעתיק את האפליקציה ל-www ומסנכרן לפרויקט האנדרואיד
npx cap open android  # פותח ב-Android Studio
```

דרוש JDK 21 ו־Android SDK 36.

## חתימה

הקובץ `android/sideload.keystore` הוא מפתח להתקנה עצמית בלבד, והוא שמור בריפו כדי שכל הבניות יהיו חתומות באותה זהות. כדי לפרסם ב־Google Play צריך ליצור מפתח אחר, פרטי, ולהחליף אותו ב־`android/app/build.gradle`.

## גבולות

- אין ניווט בזמן אמת ברקע, האפליקציה מתכננת מסלול ומציגה תחזית.
- OSRM הציבורי מחשב מסלולי רכב ולא אופנוע.
- שרתי Nominatim, OSRM ו־Open-Meteo הציבוריים ללא התחייבות לזמינות.
