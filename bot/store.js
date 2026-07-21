const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join('/tmp', 'nc_data');
const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function userDir(chatId) {
  const dir = path.join(DATA_DIR, String(chatId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function emptyLog() {
  const l = {};
  MEALS.forEach(m => l[m] = []);
  return l;
}

function getLog(chatId, date) {
  const file = path.join(userDir(chatId), `${date}.json`);
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch { return emptyLog(); }
}

function saveLog(chatId, date, log) {
  const file = path.join(userDir(chatId), `${date}.json`);
  fs.writeFileSync(file, JSON.stringify(log, null, 2));
}

function getProfile(chatId) {
  const file = path.join(userDir(chatId), 'profile.json');
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch { return null; }
}

function saveProfile(chatId, profile) {
  const file = path.join(userDir(chatId), 'profile.json');
  fs.writeFileSync(file, JSON.stringify(profile, null, 2));
}

module.exports = { getLog, saveLog, getProfile, saveProfile, MEALS };
