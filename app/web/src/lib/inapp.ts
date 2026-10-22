// TikTok, Instagram and Facebook open links in their own browser, which
// refuses Telegram and Viber links (TikTok shows a dead end for t.me). The
// order itself works there; only "write to the manager" needs a way round.

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent

export const inApp: '' | 'TikTok' | 'Instagram' | 'Facebook' =
  /musical_ly|bytedance|tiktok|trill_/i.test(ua) ? 'TikTok' : /instagram/i.test(ua) ? 'Instagram' : /FBAN|FBAV|FB_IAB|FBIOS/.test(ua) ? 'Facebook' : ''

export const android = /android/i.test(ua)

// TikTok's menu is ⋯ everywhere; Instagram's and Facebook's are ⋮ on Android.
export const menuDots = android && inApp !== 'TikTok' ? '⋮' : '⋯'

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
  document.body.appendChild(field)
  field.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(field)
  return ok
}
