import { DatabaseSync } from 'node:sqlite';
import { createInterface, emitKeypressEvents } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { findLocalDatabase, listAdmins, recoverAdmin } from './recover-admin-lib.mjs';

if (process.argv.includes('--help')) {
  console.log('Run: bash recover-admin.sh\nChoose an admin username, then enter and confirm a new password. Passwords are entered privately, never as command arguments. Existing tasks and work history are preserved.');
  process.exit(0);
}
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Run this command in your terminal so you can enter the new password privately.');
  process.exit(1);
}
function ask(question) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => { rl.close(); resolve(answer); });
  });
}
function hidden(question) {
  return new Promise((resolve, reject) => {
    process.stdout.write(question);
    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let value = '';
    function finish() {
      process.stdin.off('keypress', keypress);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    }
    function keypress(text, key = {}) {
      if (key.ctrl && key.name === 'c') { finish(); reject(new Error('Recovery cancelled. No password was changed.')); }
      else if (key.name === 'return' || key.name === 'enter') { finish(); resolve(value); }
      else if (key.name === 'backspace') value = Array.from(value).slice(0, -1).join('');
      else if (!key.ctrl && !key.meta && text && !text.includes('\u001b')) value += text;
    }
    process.stdin.on('keypress', keypress);
  });
}
let db;
try {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const flag = process.argv.indexOf('--database');
  const filename = flag >= 0 ? process.argv[flag + 1] : findLocalDatabase(root);
  if (!filename) throw new Error('Add a SQLite file path after --database.');
  db = new DatabaseSync(filename);
  const admins = listAdmins(db);
  if (!admins.length) throw new Error('No admin account exists yet. Create the first one in the app.');
  console.log('Weeknote admin recovery · this computer only');
  console.log('Admin usernames: ' + admins.map(a => a.username).join(', '));
  const username = await ask('Admin username: ');
  if (!admins.some(a => a.username === username.trim().toLowerCase())) throw new Error('Choose one of the admin usernames listed above.');
  const password = await hidden('New password (typing is hidden): ');
  const confirm = await hidden('Confirm new password: ');
  if (password !== confirm) throw new Error('Passwords do not match. No changes were made.');
  recoverAdmin(db, username, password);
  console.log('Password reset. Sign in to Weeknote with your existing username and new password. Tasks and work history are unchanged.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { db?.close(); }
