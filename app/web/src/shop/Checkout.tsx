import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { NpPicker } from '../components/NpPicker'
import { ErrorText, Field } from '../components/ui'
import { api } from '../lib/api'
import { money } from '../lib/format'
import { useAction, useTitle } from '../lib/hooks'
import { useShop } from '../lib/shop'
import { cart, cartTotal, delivery, myOrders } from '../lib/store'
import { track } from '../lib/umami'
import { CartLine, useFreshCart } from './CartPage'

type Errors = Partial<Record<'lastName' | 'firstName' | 'phone' | 'city' | 'warehouse' | 'agree', string>>

export function Checkout() {
  const shop = useShop()
  const navigate = useNavigate()
  const { items, gone } = useFreshCart()
  const saved = delivery.use()
  const [form, setForm] = useState(saved)
  const [note, setNote] = useState('')
  const [agree, setAgree] = useState(true)
  const [errors, setErrors] = useState<Errors>({})
  const { busy, error, run } = useAction()
  useTitle('Оформлення замовлення')
  const live = items.filter((i) => !gone.includes(i.variantId))

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Errors = {}
    if (form.lastName.trim().length < 2) errs.lastName = 'Вкажіть прізвище'
    if (form.firstName.trim().length < 2) errs.firstName = "Вкажіть ім'я"
    if (form.phone.replace(/\D/g, '').length < 10) errs.phone = 'Вкажіть номер, наприклад 067 123 45 67'
    if (!form.city?.name) errs.city = 'Оберіть місто'
    if (!form.warehouse?.name) errs.warehouse = 'Оберіть відділення або поштомат'
    if (!agree) errs.agree = 'Потрібна згода з умовами'
    setErrors(errs)
    if (Object.keys(errs).length) {
      document.querySelector('.invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    const res = await run(() =>
      api.post<{ number: number; token: string }>('/api/orders', {
        items: live.map((i) => ({ variantId: i.variantId, qty: i.qty })),
        lastName: form.lastName,
        firstName: form.firstName,
        phone: form.phone,
        telegram: form.telegram,
        cityName: form.city!.name,
        cityRef: form.city!.ref,
        warehouseName: form.warehouse!.name,
        warehouseRef: form.warehouse!.ref,
        warehouseKind: form.warehouse!.kind,
        note,
        agree: true,
      }),
    )
    if (!res) return
    delivery.set(form)
    myOrders.set((list) => [{ token: res.token, number: res.number, at: new Date().toISOString() }, ...list].slice(0, 20))
    track('Оформили замовлення', { total: cartTotal(live), items: live.length })
    cart.set([])
    navigate(`/order/${res.token}?new=1`, { replace: true })
  }

  if (!items.length)
    return (
      <div className="wrap">
        <div className="empty">
          <h3>Кошик порожній</h3>
          <Link to="/catalog" className="btn main">
            До каталогу
          </Link>
        </div>
      </div>
    )

  return (
    <div className="wrap">
      <div className="catalog-head">
        <h1>Оформлення</h1>
      </div>
      <form className="checkout" onSubmit={submit} noValidate>
        <div className="stack">
          <section className="card">
            <h2 className="steps-title">
              <i>1</i> Одержувач
            </h2>
            <div className="row">
              <Field label="Прізвище" error={errors.lastName}>
                <input value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} autoComplete="family-name" />
              </Field>
              <Field label="Ім'я" error={errors.firstName}>
                <input value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} autoComplete="given-name" />
              </Field>
            </div>
            <Field label="Телефон" error={errors.phone} hint="На нього Нова пошта надішле номер посилки">
              <input type="tel" inputMode="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="tel" placeholder="067 123 45 67" />
            </Field>
            <Field label="Нік у Telegram (за бажанням)" hint="Менеджер напише вам туди">
              <input value={form.telegram} onChange={(e) => set({ telegram: e.target.value })} placeholder="@nickname" autoCapitalize="none" />
            </Field>
          </section>

          <section className="card">
            <h2 className="steps-title">
              <i>2</i> Доставка Новою поштою
            </h2>
            <NpPicker value={{ city: form.city, warehouse: form.warehouse }} onChange={(v) => set(v)} errors={{ city: errors.city, warehouse: errors.warehouse }} />
            <Field label="Коментар до замовлення (за бажанням)">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ minHeight: 64 }} />
            </Field>
          </section>

          <section className="card">
            <h2 className="steps-title">
              <i>3</i> Оплата
            </h2>
            <p style={{ margin: 0 }}>
              Після оформлення ви побачите реквізити для оплати на рахунок <b>{shop.payment.recipient}</b>. Речі будуть заброньовані за вами на{' '}
              {shop.reserveHours} год.
            </p>
            <p className="muted small" style={{ marginBottom: 0 }}>
              Оплата при отриманні не приймається. Доставку оплачуєте на пошті за тарифами Нової пошти.
            </p>
          </section>
        </div>

        <aside className="card">
          <h2>Ваше замовлення</h2>
          {items.map((i) => (
            <CartLine key={i.variantId} item={i} gone={gone.includes(i.variantId)} editable={false} />
          ))}
          <div className="totals" style={{ marginTop: 8 }}>
            <div className="grand">
              <span>До сплати</span>
              <span>{money(cartTotal(live))}</span>
            </div>
          </div>
          <label className="check" style={{ margin: '14px 0 4px' }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>
              Погоджуюсь з <Link to="/info/offer" target="_blank">умовами оферти</Link> та{' '}
              <Link to="/info/privacy" target="_blank">обробкою персональних даних</Link>
            </span>
          </label>
          {errors.agree && <span className="field-error">{errors.agree}</span>}
          <ErrorText>{error}</ErrorText>
          <button className="btn main big block" style={{ marginTop: 12 }} disabled={busy || !live.length}>
            {busy ? 'Оформлюємо…' : 'Підтвердити замовлення'}
          </button>
        </aside>
      </form>
    </div>
  )
}
