const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
const store = require('./store');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

const TOKEN = process.env.TELEGRAM_TOKEN;
const PORT = process.env.PORT || 3000;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/* ---- Telegram helpers ---- */
async function tgSend(chatId, text, extra = {}) {
  await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...extra,
  }).catch(e => console.error('tgSend error:', e.message));
}

async function downloadPhoto(fileId) {
  const { data } = await axios.get(`https://api.telegram.org/bot${TOKEN}/getFile?file_id=${fileId}`);
  const filePath = data.result.file_path;
  const { data: buf } = await axios.get(
    `https://api.telegram.org/file/bot${TOKEN}/${filePath}`,
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(buf).toString('base64');
}

/* ---- Claude vision analysis ---- */
async function analyzeFood(base64Image) {
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: base64Image },
        },
        {
          type: 'text',
          text: `Analyze this food image. Identify every visible food item and estimate nutrition.

Return ONLY a valid JSON array with no extra text:
[{"name":"...", "portion":"...", "cal":0, "protein":0, "carbs":0, "fat":0}, ...]

Rules:
- Be conservative with calorie estimates
- Include every visible item (including condiments, dressings, sides)
- Portion: use natural units (e.g. "1 medium", "200g", "2 slices")
- If the image is not food, return []`,
        },
      ],
    }],
  });

  const text = res.content[0].text.trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON array in response');
  const foods = JSON.parse(match[0]);
  return foods.map(f => ({
    name: String(f.name || 'Unknown'),
    portion: String(f.portion || ''),
    cal: Math.round(Number(f.cal) || 0),
    protein: Math.round((Number(f.protein) || 0) * 10) / 10,
    carbs: Math.round((Number(f.carbs) || 0) * 10) / 10,
    fat: Math.round((Number(f.fat) || 0) * 10) / 10,
    cat: 'Analyzed',
  }));
}

/* ---- Meal by hour ---- */
function mealByHour() {
  const h = new Date().getHours();
  if (h < 10) return 'Breakfast';
  if (h < 14) return 'Lunch';
  if (h < 18) return 'Dinner';
  return 'Snacks';
}

/* ---- Format today summary ---- */
function formatSummary(chatId, date) {
  const log = store.getLog(chatId, date);
  const profile = store.getProfile(chatId);
  let totalCal = 0;
  let lines = '';

  store.MEALS.forEach(m => {
    const foods = log[m] || [];
    if (!foods.length) return;
    const mc = Math.round(foods.reduce((s, f) => s + f.cal, 0));
    totalCal += mc;
    const icon = { Breakfast: '🍳', Lunch: '🥗', Dinner: '🍽', Snacks: '🍎' }[m];
    lines += `\n${icon} <b>${m}</b> (${mc} kcal)\n`;
    lines += foods.map(f => `  • ${f.name}${f.portion ? ' <i>('+f.portion+')</i>' : ''} — ${f.cal} kcal`).join('\n') + '\n';
  });

  const tgt = profile ? profile.target : null;
  const pctTxt = tgt ? ` (${Math.round(totalCal / tgt * 100)}%)` : '';
  const remTxt = tgt
    ? totalCal <= tgt
      ? `\n✅ Remaining: <b>${tgt - totalCal} kcal</b>`
      : `\n⚠️ Over target: <b>${totalCal - tgt} kcal</b>`
    : '';

  return lines
    ? `📊 <b>Today — ${date}</b>\n${lines}\n🔥 Total: <b>${totalCal} kcal</b>${pctTxt}${remTxt}`
    : `📊 Nothing logged yet today.\n\nSend a 📸 photo of your meal to get started!`;
}

/* ---- Webhook ---- */
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // respond immediately

  const msg = req.body.message || req.body.edited_message;
  if (!msg) return;

  const chatId = String(msg.chat.id);
  const text = (msg.text || '').trim();
  const today = new Date().toISOString().slice(0, 10);

  try {
    /* ---- Photo: analyze with Claude ---- */
    if (msg.photo) {
      await tgSend(chatId, '🔍 Analyzing your meal with Claude Vision…');

      const largestPhoto = msg.photo[msg.photo.length - 1];
      const base64 = await downloadPhoto(largestPhoto.file_id);
      const foods = await analyzeFood(base64);

      if (!foods.length) {
        await tgSend(chatId, "❌ Couldn't identify food in this image.\nTry a clearer, well-lit photo.");
        return;
      }

      const meal = mealByHour();
      const log = store.getLog(chatId, today);
      foods.forEach(f => log[meal].push({ ...f, id: `${Date.now()}_${Math.random().toString(36).slice(2)}` }));
      store.saveLog(chatId, today, log);

      const totalCal = Math.round(foods.reduce((s, f) => s + f.cal, 0));
      const totalProt = Math.round(foods.reduce((s, f) => s + f.protein, 0));
      const totalCarbs = Math.round(foods.reduce((s, f) => s + f.carbs, 0));
      const totalFat = Math.round(foods.reduce((s, f) => s + f.fat, 0));

      const itemLines = foods.map(f =>
        `• <b>${f.name}</b>${f.portion ? ' <i>('+f.portion+')</i>' : ''}\n  ${f.cal} kcal · P${f.protein}g · C${f.carbs}g · F${f.fat}g`
      ).join('\n');

      await tgSend(chatId,
        `✅ <b>Logged to ${meal}</b>\n\n${itemLines}\n\n` +
        `<b>Total: ${totalCal} kcal · P${totalProt}g · C${totalCarbs}g · F${totalFat}g</b>\n\n` +
        `<i>/undo to remove · /today to see full log</i>`
      );
      return;
    }

    /* ---- Commands ---- */
    if (text.startsWith('/start') || text.startsWith('/help')) {
      await tgSend(chatId,
        `🥗 <b>Nutrition Tracker Bot</b>\n\n` +
        `📸 <b>Send a photo</b> of any meal → Claude analyzes and logs it automatically!\n\n` +
        `<b>Commands:</b>\n` +
        `/today — today's full food log\n` +
        `/undo — remove last entry\n` +
        `/help — this message\n\n` +
        `🌐 Open the web app to see full nutrition stats, history, and meal planner.`
      );
      return;
    }

    if (text.startsWith('/today')) {
      await tgSend(chatId, formatSummary(chatId, today));
      return;
    }

    if (text.startsWith('/undo')) {
      const log = store.getLog(chatId, today);
      let removed = null;
      for (let i = store.MEALS.length - 1; i >= 0; i--) {
        const m = store.MEALS[i];
        if (log[m] && log[m].length) {
          removed = log[m].pop();
          store.saveLog(chatId, today, log);
          break;
        }
      }
      await tgSend(chatId, removed
        ? `↩️ Removed: <b>${removed.name}</b> (${removed.cal} kcal)`
        : '❌ Nothing to undo today.'
      );
      return;
    }

    /* ---- Default ---- */
    await tgSend(chatId,
      `📸 Send me a <b>photo of your meal</b> and Claude will analyze and log it!\n\nUse /help to see all commands.`
    );

  } catch (err) {
    console.error('Handler error:', err);
    try {
      await tgSend(chatId, '❌ Something went wrong. Please try again.');
    } catch (_) {}
  }
});

/* ---- REST API for web app sync ---- */
app.get('/api/log', (req, res) => {
  const { chat_id, date } = req.query;
  if (!chat_id || !date) return res.status(400).json({ error: 'Missing chat_id or date' });
  res.json(store.getLog(String(chat_id), date));
});

app.get('/api/log-week', (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'Missing chat_id' });
  const logs = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    logs[key] = store.getLog(String(chat_id), key);
  }
  res.json(logs);
});

/* ---- Register webhook (call once after deploy) ---- */
app.get('/setup-webhook', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'Provide ?url=https://your-app.railway.app/webhook' });
  try {
    const { data } = await axios.get(`https://api.telegram.org/bot${TOKEN}/setWebhook?url=${encodeURIComponent(url)}`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (req, res) => res.json({ status: 'ok', service: 'Nutrition Tracker Bot' }));

app.listen(PORT, () => console.log(`Nutrition bot running on port ${PORT}`));
