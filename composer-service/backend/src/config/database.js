import { existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import logger from '../utils/logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DB_DIR = process.env.DB_DIR || join(__dirname, '..', '..', 'data')
const DB_PATH = process.env.DB_PATH || join(DB_DIR, 'compositor.db')

let db = null

// ─── Prepared Statement Cache ───────────────────────────────────────────────
// Calling db.prepare() on every request is wasteful. Prepare once, reuse.
let stmts = {}

function prepareStatements() {
  stmts = {
    auditInsert: db.prepare(`
      INSERT INTO audit_log (action, resource, resource_id, user_id, user_email, details, upstream_service)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    cacheGet: db.prepare(`SELECT value FROM cache WHERE key = ? AND expires_at > datetime('now')`),
    cacheSet: db.prepare(`
      INSERT OR REPLACE INTO cache (key, value, expires_at)
      VALUES (?, ?, datetime('now', '+' || ? || ' seconds'))
    `),
    cacheDelete: db.prepare(`DELETE FROM cache WHERE key = ?`),
    cachePurge: db.prepare(`DELETE FROM cache WHERE expires_at <= datetime('now')`),
  }
}

/**
 * Initialize the database connection and create tables.
 */
export async function initDatabase() {
  try {
    if (!existsSync(DB_DIR)) {
      mkdirSync(DB_DIR, { recursive: true })
    }

    const Database = (await import('better-sqlite3')).default
    db = new Database(DB_PATH)

    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.pragma('foreign_keys = ON')

    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        resource_id TEXT,
        user_id TEXT,
        user_email TEXT,
        details TEXT,
        upstream_service TEXT
      );

      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource, action);
      CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at);
    `)

    prepareStatements()

    logger.info({ path: DB_PATH }, 'Database initialized')
    return db
  } catch (err) {
    logger.warn({ err: err.message }, 'Database init failed — running without local DB (proxy-only mode)')
    return null
  }
}

export function getDb() {
  return db
}

/**
 * Log an action to the audit table.
 */
export function auditLog({ action, resource, resourceId, userId, userEmail, details, upstream }) {
  if (!db) return

  try {
    stmts.auditInsert.run(
      action, resource, resourceId || null, userId || null, userEmail || null,
      details ? JSON.stringify(details) : null, upstream || null
    )
  } catch (err) {
    logger.error({ err: err.message }, 'Audit log write failed')
  }
}

/**
 * Cache get with TTL check.
 */
export function cacheGet(key) {
  if (!db) return null

  try {
    const row = stmts.cacheGet.get(key)
    return row ? JSON.parse(row.value) : null
  } catch {
    return null
  }
}

/**
 * Cache set with TTL in seconds.
 */
export function cacheSet(key, value, ttlSeconds = 30) {
  if (!db) return

  try {
    stmts.cacheSet.run(key, JSON.stringify(value), ttlSeconds)
  } catch (err) {
    logger.error({ err: err.message }, 'Cache write failed')
  }
}

/**
 * Delete a specific cache entry.
 * Use this instead of cacheSet(key, null, 0) — that wrote "null" as a value.
 */
export function cacheDelete(key) {
  if (!db) return

  try {
    stmts.cacheDelete.run(key)
  } catch (err) {
    logger.error({ err: err.message }, 'Cache delete failed')
  }
}

/**
 * Purge expired cache entries (call periodically).
 */
export function cachePurge() {
  if (!db) return
  try {
    stmts.cachePurge.run()
  } catch (err) {
    logger.error({ err: err.message }, 'Cache purge failed')
  }
}

export function closeDatabase() {
  if (db) {
    db.close()
    logger.info('Database closed')
  }
}

export default { initDatabase, getDb, closeDatabase, auditLog, cacheGet, cacheSet, cacheDelete, cachePurge }
