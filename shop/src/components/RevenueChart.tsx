import { useEffect, useRef, useState } from 'react'
import type { DayRevenue } from '../lib/stats'
import { plural, uah, uahShort } from '../lib/format'

// Paid revenue per day: one series, so one colour and no legend; the card's
// title names it. Every bar answers to hover and keyboard focus, and the
// "Таблиця" switch shows the same numbers as text.

const M = { top: 22, right: 8, bottom: 26, left: 52 }
const HEIGHT = 210

// Clean steps (1, 2, 2.5 or 5 × 10ⁿ) so the ticks read 1 тис., 2 тис., 3 тис.
function niceScale(value: number): { max: number; step: number } {
  const raw = Math.max(value, 1000) / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow
  return { max: Math.ceil(Math.max(value, 1) / step) * step, step }
}

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'numeric' })
const dayLong = (iso: string) =>
  new Date(iso).toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'long' })

export function RevenueChart({ days }: { days: DayRevenue[] }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  const [active, setActive] = useState<number | null>(null)
  const [table, setTable] = useState(false)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [table])

  const { max, step } = niceScale(Math.max(...days.map((d) => d.revenue)))
  const innerW = width - M.left - M.right
  const innerH = HEIGHT - M.top - M.bottom
  const band = innerW / days.length
  const barW = Math.min(24, band * 0.62)
  const y = (v: number) => M.top + innerH - (v / max) * innerH
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step)
  const labelEvery = band < 34 ? 2 : 1
  const peak = days.reduce((best, d, i) => (d.revenue > days[best].revenue ? i : best), 0)
  const total = days.reduce((s, d) => s + d.revenue, 0)

  return (
    <div>
      <div className="row-wrap" style={{ justifyContent: 'flex-end', marginTop: -6, marginBottom: 6 }}>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => setTable((t) => !t)} aria-pressed={table}>
          {table ? 'Графік' : 'Таблиця'}
        </button>
      </div>

      {table ? (
        <table className="data">
          <thead>
            <tr>
              <th>День</th>
              <th className="r">Замовлень</th>
              <th className="r">Виручка</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day}>
                <td>{dayLong(d.day)}</td>
                <td className="r">{d.orders}</td>
                <td className="r">{uah(d.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div ref={box} style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
          <svg width={width} height={HEIGHT} role="img" aria-label={`Виручка по днях, разом ${uah(total)}`} style={{ display: 'block' }}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
                <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--ink-3)" className="num">
                  {uahShort(t)}
                </text>
              </g>
            ))}

            {days.map((d, i) => {
              const cx = M.left + band * i + band / 2
              const h = Math.max(0, y(0) - y(d.revenue))
              const x = cx - barW / 2
              const r = Math.min(4, h, barW / 2)
              const top = y(0) - h
              return (
                <g key={d.day}>
                  {h > 0 && (
                    <path
                      d={`M${x} ${y(0)}V${top + r}q0 ${-r} ${r} ${-r}h${barW - 2 * r}q${r} 0 ${r} ${r}V${y(0)}Z`}
                      fill="var(--chart)"
                      opacity={active === null || active === i ? 1 : 0.55}
                    />
                  )}
                  {i === peak && d.revenue > 0 && active === null && (
                    <text x={cx} y={top - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--ink-2)">
                      {uahShort(d.revenue)}
                    </text>
                  )}
                  {i % labelEvery === (days.length - 1) % labelEvery && (
                    <text x={cx} y={HEIGHT - 8} textAnchor="middle" fontSize={11} fill="var(--ink-3)" className="num">
                      {dayLabel(d.day)}
                    </text>
                  )}
                  <rect
                    x={M.left + band * i}
                    y={M.top}
                    width={band}
                    height={innerH}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${dayLong(d.day)}: ${uah(d.revenue)}, ${d.orders} ${plural(d.orders, 'замовлення', 'замовлення', 'замовлень')}`}
                    onPointerEnter={(e) => e.pointerType === 'mouse' && setActive(i)}
                    onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
                    onPointerDown={(e) => e.pointerType !== 'mouse' && setActive((a) => (a === i ? null : i))}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    style={{ outline: 'none', cursor: 'default' }}
                  />
                </g>
              )
            })}
          </svg>

          {active !== null && (
            <div
              role="status"
              style={{
                position: 'absolute',
                top: Math.max(0, y(days[active].revenue) - 64),
                left: Math.min(Math.max(M.left + band * active + band / 2 - 70, 0), width - 140),
                width: 140,
                padding: '8px 10px',
                borderRadius: 10,
                background: 'var(--surface)',
                boxShadow: 'var(--shadow), 0 0 0 1px var(--line)',
                pointerEvents: 'none',
                fontSize: 12,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700 }}>{uah(days[active].revenue)}</div>
              <div className="muted">
                {dayLong(days[active].day)} · {days[active].orders} {plural(days[active].orders, 'замовл.', 'замовл.', 'замовл.')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
