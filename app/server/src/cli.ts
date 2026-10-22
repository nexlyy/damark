import readline from 'node:readline/promises'
import { hashPassword } from './auth.js'
import { paths } from './config.js'
import { openDb } from './db.js'
import { randomToken } from './util.js'

// Staff accounts from the server's command line, for the first login and
// for a forgotten password:
//
//   npm run user -- add anna "Анна" owner
//   npm run user -- password anna
//   npm run user -- list
//
// A new password is printed once; change it after logging in.

const [cmd, login, name, role] = process.argv.slice(2)
const db = openDb(paths.db)

async function ask(question: string) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(question)
  rl.close()
  return answer
}

if (cmd === 'add' && login && name && ['owner', 'manager', 'dev'].includes(role ?? '')) {
  const password = randomToken(12)
  db.prepare('INSERT INTO users (login, name, role, password_hash) VALUES (?, ?, ?, ?)').run(login, name, role, await hashPassword(password))
  console.log(`Added ${login} (${role}). Password: ${password}`)
} else if (cmd === 'password' && login) {
  const row = db.prepare('SELECT id FROM users WHERE login = ?').get(login) as { id: number } | undefined
  if (!row) {
    console.error(`No user ${login}`)
    process.exit(1)
  }
  const typed = (await ask('New password (empty: generate one): ')).trim()
  const password = typed || randomToken(12)
  if (password.length < 10) {
    console.error('At least 10 characters.')
    process.exit(1)
  }
  db.prepare('UPDATE users SET password_hash = ?, disabled = 0 WHERE id = ?').run(await hashPassword(password), row.id)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.id)
  console.log(typed ? 'Password changed.' : `Password: ${password}`)
} else if (cmd === 'list') {
  console.table(db.prepare('SELECT id, login, name, role, disabled, tg_username FROM users').all())
} else {
  console.log('usage: npm run user -- add <login> "<name>" owner|manager|dev | password <login> | list')
}
db.close()
