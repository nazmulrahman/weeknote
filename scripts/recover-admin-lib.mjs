import { DatabaseSync } from 'node:sqlite';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { createHash, pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';

export function findLocalDatabase(projectRoot) {
  const directory = path.join(projectRoot, '.wrangler/state/v3/d1');
  const candidates = readdirSync(directory, { recursive: true })
    .filter(name => name.endsWith('.sqlite'))
    .map(name => path.join(directory, name))
    .filter(filename => {
      const db = new DatabaseSync(filename, { readOnly: true });
      try {
        return db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('accounts','members','login_sessions')").get().n === 3;
      } finally { db.close(); }
    });
  if (candidates.length !== 1) throw new Error('Could not select one Weeknote database. Pass --database followed by its SQLite file path.');
  return candidates[0];
}

export function listAdmins(db) {
  return db.prepare("SELECT a.username FROM accounts a JOIN members m ON m.id=a.member WHERE m.role='manager' AND m.sample=0 ORDER BY a.username").all();
}

export function recoverAdmin(db, username, password) {
  if (typeof password !== 'string' || password.length === 0) throw new Error('Enter a non-empty password.');
  username = String(username).trim().toLowerCase();
  const salt = randomBytes(32).toString('hex');
  const hash = 'pbkdf2-sha256$100000$' + salt + '$' + pbkdf2Sync(password, Buffer.from(salt, 'hex'), 100000, 32, 'sha256').toString('hex');
  const now = Date.now();
  db.exec('PRAGMA busy_timeout=5000');
  db.exec('BEGIN IMMEDIATE');
  try {
    const admin = db.prepare("SELECT a.member FROM accounts a JOIN members m ON m.id=a.member WHERE a.username=? AND m.role='manager' AND m.sample=0").get(username);
    if (!admin) throw new Error('That username is not an admin account. No changes were made.');
    db.prepare('UPDATE accounts SET password_hash=?,active=1 WHERE member=?').run(hash, admin.member);
    db.prepare('DELETE FROM login_sessions WHERE member=?').run(admin.member);
    db.prepare('UPDATE sessions SET end=? WHERE member=? AND end IS NULL').run(now, admin.member);
    db.prepare("UPDATE members SET availability='Away' WHERE id=?").run(admin.member);
    db.prepare('DELETE FROM login_attempts WHERE key IN (?,?)').run('user:' + createHash('sha256').update(username).digest('hex'), 'ip:' + createHash('sha256').update('local').digest('hex'));
    db.prepare('INSERT INTO admin_events (id,actor,target,message,time) VALUES (?,?,?,?,?)').run(randomUUID(), admin.member, admin.member, 'Recovered admin password from this computer', now);
    db.exec('COMMIT');
    return username;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
