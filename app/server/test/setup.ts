import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

// Imported first by every test file: a throwaway data folder and stand-ins
// for Telegram and Nova Poshta, before config.ts reads the environment.

export type Call = { path: string; body: Record<string, unknown> }
export const telegramCalls: Call[] = []
export const npCalls: Call[] = []

// Tests set these to shape Nova Poshta's answers.
export const np = {
  trackingCode: 7,
  trackingText: 'Прибув у відділення',
}

function serve(handler: (path: string, body: Record<string, unknown>) => unknown) {
  return new Promise<string>((resolve) => {
    const server = http.createServer((req, res) => {
      let raw = ''
      req.on('data', (c) => (raw += c))
      req.on('end', () => {
        const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(handler(req.url ?? '', body)))
      })
    })
    server.listen(0, '127.0.0.1', () => {
      server.unref()
      resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`)
    })
  })
}

const telegramUrl = await serve((p, body) => {
  telegramCalls.push({ path: p, body })
  if (p.endsWith('/getMe')) return { ok: true, result: { username: 'damark_test_bot' } }
  if (p.endsWith('/sendMessage')) return { ok: true, result: { message_id: telegramCalls.length } }
  return { ok: true, result: true }
})

const npUrl = await serve((_p, body) => {
  npCalls.push({ path: _p, body })
  const call = `${body.modelName}.${body.calledMethod}`
  const props = body.methodProperties as Record<string, unknown>
  switch (call) {
    case 'Address.searchSettlements':
      return {
        success: true,
        data: [{ TotalCount: 1, Addresses: [{ DeliveryCity: 'db5c88e0-391c-11dd-90d9-001a92567626', MainDescription: 'Київ', Area: 'Київська', Region: '', SettlementTypeCode: 'м.', Warehouses: 2000 }] }],
        errors: [],
      }
    case 'AddressGeneral.getWarehouses':
      return {
        success: true,
        data: [
          { Ref: '1ec09d88-e1c2-11e3-8c4a-0050568002cf', Description: 'Відділення №5: вул. Хрещатик, 1', Number: '5', CategoryOfWarehouse: 'Branch', WarehouseStatus: 'Working' },
          { Ref: '2ec09d88-e1c2-11e3-8c4a-0050568002cf', Description: 'Поштомат №3010', Number: '3010', CategoryOfWarehouse: 'Postomat', WarehouseStatus: 'Working' },
        ],
        errors: [],
      }
    case 'Counterparty.save':
      return { success: true, data: [{ Ref: 'recipient-ref', ContactPerson: { data: [{ Ref: 'contact-ref' }] } }], errors: [] }
    case 'InternetDocument.save':
      return { success: true, data: [{ Ref: 'doc-ref', IntDocNumber: '20450000000001', CostOnSite: 70, EstimatedDeliveryDate: '25.10.2026' }], errors: [] }
    case 'TrackingDocument.getStatusDocuments':
      return {
        success: true,
        data: (props.Documents as Array<{ DocumentNumber: string }>).map((d) => ({ Number: d.DocumentNumber, StatusCode: String(np.trackingCode), Status: np.trackingText })),
        errors: [],
      }
    default:
      return { success: false, data: [], errors: [`unexpected ${call}`] }
  }
})

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'damark-test-'))
process.env.DATA_DIR = dataDir
process.env.TELEGRAM_API = telegramUrl
process.env.NOVA_POSHTA_API = npUrl
process.env.PUBLIC_URL = 'https://new.damark.test'
process.env.JOBS = 'false'
process.env.SERVE_STATIC = 'true'
process.env.TZ = 'Europe/Kyiv'
