-- Cloudflare D1 bootstrap from Hotel Service demo schema.

-- Contains schema ONLY and no production user accounts/booking records.

-- Foreign keys are enabled by Cloudflare D1.

CREATE TABLE hotels (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL, city TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5)
    , description TEXT NOT NULL DEFAULT '', image_url TEXT NOT NULL DEFAULT '', area TEXT NOT NULL DEFAULT '');

CREATE TABLE rooms (
      id TEXT PRIMARY KEY,
      hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
      room_type TEXT NOT NULL,
      price_per_night INTEGER NOT NULL CHECK (price_per_night >= 0),
      capacity INTEGER NOT NULL CHECK (capacity > 0),
      total_units INTEGER NOT NULL CHECK (total_units >= 0)
    , description TEXT NOT NULL DEFAULT '', facilities TEXT NOT NULL DEFAULT '', image_url TEXT NOT NULL DEFAULT '', size_m2 INTEGER NOT NULL DEFAULT 0, bed_type TEXT NOT NULL DEFAULT '');

CREATE TABLE counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);

CREATE TABLE users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name          TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('admin','receptionist')),
      password_hash TEXT NOT NULL,
      active        INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );

CREATE TABLE api_clients (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL UNIQUE,
      token_hash   TEXT NOT NULL UNIQUE,
      token_prefix TEXT NOT NULL,
      active       INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      last_used_at TEXT
    );

CREATE TABLE activity_log (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      actor  TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT ''
    );

CREATE TABLE idempotency_keys (
      key        TEXT PRIMARY KEY,
      response   TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    , request_hash TEXT NOT NULL DEFAULT '');

CREATE TABLE bookings (
    id             TEXT PRIMARY KEY,
    hotel_id       TEXT NOT NULL REFERENCES hotels(id),
    room_id        TEXT NOT NULL REFERENCES rooms(id),
    guest_name     TEXT NOT NULL,
    guest_email    TEXT NOT NULL DEFAULT '',
    guest_phone    TEXT NOT NULL DEFAULT '',
    guests         INTEGER NOT NULL DEFAULT 1,
    check_in_date  TEXT NOT NULL,
    check_out_date TEXT NOT NULL,
    total_price    INTEGER NOT NULL,
    status         TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','checked_in','checked_out','cancelled')),
    source         TEXT NOT NULL DEFAULT 'website',
    access_token_hash TEXT,
    payment_status TEXT NOT NULL DEFAULT 'unpaid',
    payment_method TEXT NOT NULL DEFAULT '',
    paid_amount    INTEGER NOT NULL DEFAULT 0,
    paid_at        TEXT,
    refund_amount  INTEGER NOT NULL DEFAULT 0,
    cancelled_at   TEXT,
    cancel_reason  TEXT NOT NULL DEFAULT '',
    checked_in_at  TEXT,
    checked_out_at TEXT,
    notes          TEXT NOT NULL DEFAULT '',
    created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

CREATE TABLE webhook_endpoints (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      url        TEXT NOT NULL,
      secret     TEXT NOT NULL,
      events     TEXT NOT NULL DEFAULT 'booking.confirmed,booking.paid,booking.cancelled,booking.checked_in,booking.checked_out',
      active     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      last_used_at TEXT
    );

CREATE TABLE webhook_deliveries (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint_id INTEGER NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
      event       TEXT NOT NULL,
      payload     TEXT NOT NULL,
      status_code INTEGER,
      success     INTEGER NOT NULL DEFAULT 0,
      error       TEXT NOT NULL DEFAULT '',
      delivered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

CREATE INDEX idx_activity_target ON activity_log(target);

CREATE INDEX idx_bookings_room_dates ON bookings(room_id, status, check_in_date, check_out_date);

CREATE INDEX idx_rooms_hotel ON rooms(hotel_id);

-- Pembatasan percobaan login lintas instance Workers
CREATE TABLE IF NOT EXISTS login_attempts (
 key TEXT PRIMARY KEY,
 count INTEGER NOT NULL,
 until INTEGER NOT NULL
);
