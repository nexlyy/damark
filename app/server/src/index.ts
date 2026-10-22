import { buildApp } from './app.js'
import { config, paths } from './config.js'
import { openDb } from './db.js'
import { startJobs } from './jobs.js'
import { startBot } from './telegram.js'

const db = openDb(paths.db)
const app = await buildApp(db, { logger: true })
const log = (msg: string) => app.log.info(msg)

if (config.jobs) {
  startBot(db, log)
  startJobs(db, log)
}

await app.listen({ port: config.port, host: config.host })

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.close().finally(() => {
      db.close()
      process.exit(0)
    })
  })
}
