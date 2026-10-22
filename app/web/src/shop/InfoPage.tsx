import { Fragment, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { Empty, Spinner } from '../components/ui'
import { date } from '../lib/format'
import { useFetch, useTitle } from '../lib/hooks'

type Page = { slug: string; title: string; body: string; updated_at: string }

// The pages' small text format: "## " headings, "- " or "1. " list items,
// blank lines between paragraphs.
export function renderText(body: string): ReactNode[] {
  const blocks = body.replace(/\r/g, '').split(/\n{2,}/)
  return blocks.map((block, i) => {
    const lines = block.split('\n')
    if (block.startsWith('## ')) return <h2 key={i}>{block.slice(3)}</h2>
    if (lines.every((l) => /^- /.test(l)))
      return (
        <ul key={i}>
          {lines.map((l, j) => (
            <li key={j}>{l.slice(2)}</li>
          ))}
        </ul>
      )
    if (lines.every((l) => /^\d+\. /.test(l)))
      return (
        <ol key={i}>
          {lines.map((l, j) => (
            <li key={j}>{l.replace(/^\d+\. /, '')}</li>
          ))}
        </ol>
      )
    return (
      <p key={i}>
        {lines.map((l, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {l}
          </Fragment>
        ))}
      </p>
    )
  })
}

export function InfoPage() {
  const { slug } = useParams()
  const { data, error } = useFetch<Page>(`/api/pages/${slug}`)
  useTitle(data?.title)
  if (error) return <Empty icon="doc" title="Сторінку не знайдено" />
  if (!data) return <Spinner />
  return (
    <div className="wrap">
      <article className="card prose" style={{ marginTop: 16 }}>
        <h1>{data.title}</h1>
        {renderText(data.body)}
        <p className="faint small">Оновлено {date(data.updated_at)}</p>
      </article>
    </div>
  )
}

export function NotFound() {
  return (
    <div className="wrap">
      <Empty icon="search" title="Такої сторінки немає">
        <a href="/" className="btn main">
          На головну
        </a>
      </Empty>
    </div>
  )
}
