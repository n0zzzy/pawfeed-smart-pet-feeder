// SQLite database for the PawFeed server (Node's built-in node:sqlite).
// Stores user accounts plus the feeder's settings, schedules, feed log and notifications.
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DB_FILE = process.env.PAWFEED_DB || path.join(__dirname, 'data', 'pawfeed.db');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,          -- scrypt hash, never the plain password
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS device (
    id                   INTEGER PRIMARY KEY CHECK (id = 1),   -- one feeder
    device_id            TEXT    NOT NULL,
    connection           TEXT    NOT NULL,
    network_available    INTEGER NOT NULL,
    manual_pairing_calls INTEGER NOT NULL,
    food_level           INTEGER NOT NULL,
    portion_slots        INTEGER NOT NULL,
    dispense_count       INTEGER NOT NULL,
    jammed               INTEGER NOT NULL,
    clock                TEXT    NOT NULL,
    next_id              INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS schedules (
    id    INTEGER PRIMARY KEY,
    time  TEXT    NOT NULL,
    slots INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS feed_log (
    id           INTEGER PRIMARY KEY,
    time         TEXT    NOT NULL,
    source       TEXT    NOT NULL,     -- MANUAL / SCHEDULED
    slots        INTEGER NOT NULL,
    weight_grams REAL    NOT NULL,
    status       TEXT    NOT NULL      -- DISPENSED / JAM_DETECTED
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id      INTEGER PRIMARY KEY,
    type    TEXT NOT NULL,             -- LOW_FOOD / JAM
    message TEXT NOT NULL,
    time    TEXT NOT NULL
  );
`;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [, salt, hash] = stored.split('$');
  const candidate = crypto.scryptSync(password, salt, 32);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

function openDatabase() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);

  // Demo account for the class project
  const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get('testuser');
  if (!exists) {
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('testuser', hashPassword('Feeder@123'));
  }

  function authenticate(username, password) {
    const row = db.prepare('SELECT password_hash FROM users WHERE username = ?').get(username);
    return Boolean(row && verifyPassword(password, row.password_hash));
  }

  // Rebuild the device state object used by device-core.js from the tables.
  function load() {
    const d = db.prepare('SELECT * FROM device WHERE id = 1').get();
    if (!d) return null;
    return {
      deviceId: d.device_id,
      connection: d.connection,
      networkAvailable: Boolean(d.network_available),
      manualPairingCalls: d.manual_pairing_calls,
      foodLevel: d.food_level,
      portionSlots: d.portion_slots,
      dispenseCount: d.dispense_count,
      jammed: Boolean(d.jammed),
      clock: d.clock,
      nextId: d.next_id,
      schedules: db.prepare('SELECT id, time, slots FROM schedules ORDER BY id').all().map(r => ({ ...r })),
      deviceSchedules: [],
      feedLog: db.prepare('SELECT * FROM feed_log ORDER BY id DESC').all().map(r => ({ ...r })),
      notifications: db.prepare('SELECT * FROM notifications ORDER BY id DESC').all().map(r => ({ ...r })),
    };
  }

  // Write the whole device state back to the tables in one transaction.
  function save(s) {
    db.exec('BEGIN');
    try {
      db.prepare(`INSERT INTO device (id, device_id, connection, network_available, manual_pairing_calls, food_level,
          portion_slots, dispense_count, jammed, clock, next_id)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET device_id = excluded.device_id, connection = excluded.connection,
          network_available = excluded.network_available, manual_pairing_calls = excluded.manual_pairing_calls,
          food_level = excluded.food_level, portion_slots = excluded.portion_slots, dispense_count = excluded.dispense_count,
          jammed = excluded.jammed, clock = excluded.clock, next_id = excluded.next_id`)
        .run(s.deviceId, s.connection, s.networkAvailable ? 1 : 0, s.manualPairingCalls, s.foodLevel,
          s.portionSlots, s.dispenseCount, s.jammed ? 1 : 0, s.clock, s.nextId);

      db.exec('DELETE FROM schedules; DELETE FROM feed_log; DELETE FROM notifications;');
      const sch = db.prepare('INSERT INTO schedules (id, time, slots) VALUES (?, ?, ?)');
      for (const r of s.schedules) sch.run(r.id, r.time, r.slots);
      const log = db.prepare('INSERT INTO feed_log (id, time, source, slots, weight_grams, status) VALUES (?, ?, ?, ?, ?, ?)');
      for (const r of s.feedLog) log.run(r.id, r.time, r.source, r.slots, r.weight_grams, r.status);
      const note = db.prepare('INSERT INTO notifications (id, type, message, time) VALUES (?, ?, ?, ?)');
      for (const r of s.notifications) note.run(r.id, r.type, r.message, r.time);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  return { authenticate, load, save, file: DB_FILE };
}

module.exports = { openDatabase, DB_FILE };
