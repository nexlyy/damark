/*
  Shared by every version of the DaMark link page.

  - [data-copy="text"]           copies the text; data-label names it in the toast
  - [data-copy-all]              copies every [data-copy][data-label] inside the
                                 nearest [data-copy-group], one "label: text" a line
  - a[data-app]                  Telegram and Viber links: inside TikTok,
                                 Instagram or Facebook a tap first explains how to
                                 open the page in a real browser, or to copy the
                                 username or number into the app by hand
  - [data-track="name"]          counts a tap as an Umami event, on pages that
                                 load the Umami script; elsewhere does nothing

  Add ?inapp=1 to the address to see the in-app behaviour in a normal browser.
*/
(function () {
  var ua = navigator.userAgent || ''
  var android = /android/i.test(ua)
  var forced = /[?&]inapp=1(&|$)/.test(location.search)
  var detected =
    /musical_ly|bytedance|tiktok|trill_/i.test(ua) ? 'TikTok' :
    /instagram/i.test(ua) ? 'Instagram' :
    /FBAN|FBAV|FB_IAB|FBIOS/.test(ua) ? 'Facebook' : ''
  var app = detected || (forced ? 'TikTok' : '')

  // Umami's script is deferred and this one is not, so early events wait for
  // it. Umami's own data-umami-event is not used: on links it navigates by
  // itself and would skip the explanation sheet below.
  function track(name, data) {
    function send() { try { window.umami.track(name, data) } catch (e) {} }
    if (window.umami) send()
    else window.addEventListener('load', send)
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-track]')
    if (el) track(el.getAttribute('data-track'))
  })

  var css = [
    '.dm-toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));z-index:60;transform:translateX(-50%);max-width:calc(100% - 32px);padding:10px 16px;border-radius:12px;background:#1d1b22;color:#fff;font-family:inherit;font-size:14px;font-weight:600;line-height:1.3;box-shadow:0 10px 30px -12px rgba(0,0,0,.5)}',
    '.dm-sheet{position:fixed;inset:0;z-index:50;display:flex;align-items:flex-end;justify-content:center;padding:96px 12px calc(12px + env(safe-area-inset-bottom));background:rgba(12,10,20,.8);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);overflow-y:auto;font-family:inherit}',
    '.dm-sheet[hidden]{display:none}',
    '.dm-arrow{position:fixed;top:4px;right:10px;width:92px;height:92px;color:var(--dm-accent,#ffd34d);animation:dm-nudge 1.2s ease-in-out infinite}',
    '@keyframes dm-nudge{0%,100%{transform:translate(0,0)}50%{transform:translate(4px,-6px)}}',
    '@media (prefers-reduced-motion:reduce){.dm-arrow{animation:none}}',
    '.dm-card{width:100%;max-width:440px;padding:22px 18px 14px;border-radius:22px;background:#fff;color:#1d1b22;text-align:left}',
    '.dm-card h2{margin:0 0 6px;font-size:21px;line-height:1.25;outline:none}',
    '.dm-card p{margin:0 0 14px;color:#5b5868;font-size:15px}',
    '.dm-card ol{margin:0 0 16px;padding:0;list-style:none;counter-reset:n}',
    '.dm-card li{counter-increment:n;display:flex;align-items:center;gap:12px;padding:10px 0;font-size:16px;border-top:1px solid #eee}',
    '.dm-card li:first-child{border-top:0}',
    '.dm-card li::before{content:counter(n);flex:none;display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--dm-main,#1d1b22);color:#fff;font-weight:700;font-size:15px}',
    '.dm-card .dm-dots{display:inline-grid;place-items:center;min-width:34px;height:26px;padding:0 6px;border-radius:8px;background:#f0eef4;font-weight:700;letter-spacing:1px}',
    '.dm-btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:54px;margin-top:8px;border:0;border-radius:14px;background:#f0eef4;color:#1d1b22;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}',
    '.dm-btn.dm-main{background:var(--dm-main,#1d1b22);color:#fff}',
    '.dm-btn{flex-direction:column}.dm-btn small{margin-top:2px;font-size:13px;font-weight:600;opacity:.7}',
    '.dm-plain{display:block;width:100%;margin-top:6px;padding:12px;border:0;background:none;color:#5b5868;font:inherit;font-size:15px;text-align:center;text-decoration:underline;text-underline-offset:3px;cursor:pointer}',
    '.dm-ok{margin:8px 2px 0!important;color:#19734a!important;font-size:14px!important}',
  ].join('\n')

  var style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)

  var toastEl
  var toastTimer
  function toast(text) {
    if (!toastEl) {
      toastEl = document.createElement('div')
      toastEl.className = 'dm-toast'
      toastEl.setAttribute('role', 'status')
      document.body.appendChild(toastEl)
    }
    toastEl.textContent = text
    toastEl.hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { toastEl.hidden = true }, 2200)
  }

  // Clipboard first; the old select-and-copy where an app's browser blocks
  // it; and if both fail, a box with the text to copy by hand.
  function copy(text, done) {
    function byHand() {
      var field = document.createElement('textarea')
      field.value = text
      field.setAttribute('readonly', '')
      field.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
      document.body.appendChild(field)
      field.select()
      field.setSelectionRange(0, text.length)
      var ok = false
      try { ok = document.execCommand('copy') } catch (e) {}
      document.body.removeChild(field)
      if (ok) done()
      else window.prompt('Скопіюйте:', text)
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, byHand)
    } else {
      byHand()
    }
  }

  document.addEventListener('click', function (e) {
    var one = e.target.closest && e.target.closest('[data-copy]')
    if (one) {
      e.preventDefault()
      copy(one.getAttribute('data-copy'), function () {
        one.classList.add('done')
        setTimeout(function () { one.classList.remove('done') }, 1500)
        toast('Скопійовано: ' + (one.getAttribute('data-label') || 'текст'))
        track('Копія реквізиту', { label: one.getAttribute('data-label') || '' })
      })
      return
    }
    var all = e.target.closest && e.target.closest('[data-copy-all]')
    if (all) {
      var group = all.closest('[data-copy-group]') || document
      var items = group.querySelectorAll('[data-copy][data-label]')
      var lines = Array.prototype.map.call(items, function (el) {
        return el.getAttribute('data-label') + ': ' + el.getAttribute('data-copy')
      })
      copy(lines.join('\n'), function () {
        toast('Усі реквізити скопійовано')
        track('Копія всіх реквізитів')
      })
    }
  })

  if (!app) return
  document.documentElement.classList.add('in-app')
  if (detected) track('Зайшли із застосунку', { app: detected })

  // TikTok's menu is ⋯ on every phone, Instagram's and Facebook's are ⋮ on
  // Android. TikTok also refuses intent:// links ("action failed") and stops
  // t.me links at a page of its own, so there it gets neither the Chrome
  // button nor "try here anyway": only the menu, the copied page link, or the
  // contact copied to paste into Telegram or Viber by hand.
  var tiktok = app === 'TikTok'
  var dots = android && !tiktok ? '⋮' : '⋯'
  var item = app === 'Instagram' ? (android ? '«Відкрити в Chrome»' : '«Відкрити в зовнішньому браузері»') : '«Відкрити в браузері»'
  var chrome = android && !tiktok && /^https?:$/.test(location.protocol)
  var page = location.protocol + '//' + location.host + location.pathname

  var sheet = document.createElement('div')
  sheet.className = 'dm-sheet'
  sheet.hidden = true
  sheet.setAttribute('role', 'dialog')
  sheet.setAttribute('aria-modal', 'true')
  sheet.setAttribute('aria-labelledby', 'dm-title')
  sheet.innerHTML =
    '<svg class="dm-arrow" viewBox="0 0 92 92" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 84C20 50 40 28 72 16"/><path d="M52 12 74 15 66 36"/></svg>' +
    '<div class="dm-card">' +
    '<h2 id="dm-title" tabindex="-1">Спочатку відкрийте сторінку в браузері</h2>' +
    '<p>' + (tiktok ? 'TikTok не відкриває Telegram і Viber.' : 'З ' + app + ' Telegram і Viber часто не відкриваються.') + ' Це займе 2 секунди:</p>' +
    '<ol><li><span>Натисніть <span class="dm-dots">' + dots + '</span> у <b>правому верхньому куті</b></span></li>' +
    '<li><span>Оберіть <b>' + item + '</b></span></li></ol>' +
    (chrome
      ? '<a class="dm-btn dm-main" href="intent://' + location.host + location.pathname + location.search + '#Intent;scheme=https;package=com.android.chrome;end" data-track="Відкрили в Chrome">Відкрити в Chrome</a>'
      : '') +
    '<button class="dm-btn' + (chrome ? '' : ' dm-main') + '" type="button" data-dm="copy">Скопіювати посилання</button>' +
    '<button class="dm-btn" type="button" data-dm="contact" hidden></button>' +
    '<p class="dm-ok" role="status" hidden></p>' +
    (tiktok ? '' : '<a class="dm-plain" data-dm="anyway" data-track="Все одно спробували тут" hidden>Все одно спробувати тут</a>') +
    '<button class="dm-plain" type="button" data-dm="close">Закрити</button>' +
    '</div>'
  document.body.appendChild(sheet)

  var copyBtn = sheet.querySelector('[data-dm="copy"]')
  var contactBtn = sheet.querySelector('[data-dm="contact"]')
  var ok = sheet.querySelector('.dm-ok')
  var anyway = sheet.querySelector('[data-dm="anyway"]')
  var contact

  // The Telegram username or Viber number behind a link, to paste into that
  // app's search when the link itself will not open.
  function contactOf(href) {
    var tg = /^https:\/\/t\.me\/(\w+)/.exec(href || '')
    if (tg) return { app: 'Telegram', text: '@' + tg[1], shown: '@' + tg[1] }
    var vb = /^viber:\/\/chat\?number=([^&]+)/.exec(href || '')
    if (vb) {
      var n = decodeURIComponent(vb[1])
      return { app: 'Viber', text: n, shown: n.replace(/^\+380(\d\d)(\d{3})(\d\d)(\d\d)$/, '+380 $1 $2 $3 $4') }
    }
    return null
  }

  function say(text) {
    ok.textContent = text
    ok.hidden = false
  }

  function show(target) {
    contact = contactOf(target)
    contactBtn.hidden = !contact
    if (contact) {
      contactBtn.textContent = contact.app === 'Viber' ? 'Скопіювати номер' : 'Скопіювати нік'
      var small = document.createElement('small')
      small.textContent = contact.shown
      contactBtn.appendChild(small)
    }
    copyBtn.textContent = 'Скопіювати посилання'
    ok.hidden = true
    if (anyway) {
      anyway.hidden = !target
      if (target) anyway.href = target
    }
    sheet.hidden = false
    sheet.querySelector('#dm-title').focus()
  }
  function hide() { sheet.hidden = true }

  sheet.addEventListener('click', function (e) {
    var act = e.target.closest && e.target.closest('[data-dm]')
    var what = act && act.getAttribute('data-dm')
    if (e.target === sheet || what === 'close') return hide()
    if (what === 'copy') {
      copy(page, function () {
        track('Скопіювали посилання на сторінку')
        copyBtn.textContent = 'Посилання скопійовано ✓'
        say('Відкрийте Chrome або Safari і вставте посилання в адресний рядок.')
      })
    }
    if (what === 'contact' && contact) {
      var c = contact
      copy(c.text, function () {
        track('Скопіювали контакт', { contact: c.text })
        contactBtn.textContent = 'Скопійовано ✓'
        say(c.app === 'Viber'
          ? 'Відкрийте Viber, натисніть пошук і вставте номер.'
          : 'Відкрийте Telegram, натисніть пошук і вставте ' + c.text + '.')
      })
    }
  })
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sheet.hidden) hide() })

  // Telegram and Viber: explain first, and leave a way through.
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a[data-app]')
    if (!link || sheet.contains(link)) return
    e.preventDefault()
    show(link.getAttribute('href'))
  })

  // Any element marked data-open-help opens the explanation on tap.
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-open-help]')) show()
  })
})()
