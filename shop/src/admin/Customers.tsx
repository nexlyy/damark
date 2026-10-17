import { Empty, Badge } from '../components/ui'
import { toggleBlacklist, useShop } from '../lib/store'
import { dateShort, uah } from '../lib/format'
import { customers } from '../lib/stats'

export function Customers() {
  const data = useShop()
  const list = customers(data)
  const black = new Set(data.settings.blacklist)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Клієнти</h1>
          <p className="muted">Збираються самі із замовлень. Хто відмовився від посилки — у чорний список.</p>
        </div>
      </div>

      {list.length === 0 ? (
        <Empty icon="users" title="Клієнтів ще немає">
          Щойно з’явиться перше замовлення, клієнт буде тут — з сумою покупок і відмовами.
        </Empty>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Клієнт</th>
                <th className="r">Замовлень</th>
                <th className="r">Купила на</th>
                <th>Останнє</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const contact = c.phone || c.telegram
                const banned = [c.phone, c.telegram].some((x) => x && black.has(x))
                return (
                  <tr key={c.key}>
                    <td>
                      <b>{c.name || c.telegram || c.phone}</b>
                      <div className="faint">{[c.telegram, c.phone].filter(Boolean).join(' · ')}</div>
                      {c.refused > 0 && <Badge tone="critical">Відмов: {c.refused}</Badge>}
                    </td>
                    <td className="r">{c.orders}</td>
                    <td className="r">{uah(c.spent)}</td>
                    <td className="faint">{dateShort(c.last)}</td>
                    <td className="r">
                      <button className={banned ? 'btn btn-ghost btn-sm' : 'btn btn-danger btn-sm'} type="button" disabled={!contact} onClick={() => toggleBlacklist(contact)}>
                        {banned ? 'Прибрати з ЧС' : 'У чорний список'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
