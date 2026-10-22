import { Component, type ReactNode } from 'react'

// If a screen fails to draw, say so and offer a way out, instead of leaving
// a blank page that ignores every tap until the whole site is reloaded.
// Moving to another address (resetKey) clears the failure.
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string; home?: string }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="empty" role="alert">
        <h3>Ця сторінка не відкрилася</h3>
        <p>Спробуйте оновити. Якщо повториться — напишіть нам.</p>
        <code className="faint small" style={{ wordBreak: 'break-word' }}>
          {error.message}
        </code>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn" type="button" onClick={() => location.reload()}>
            Оновити
          </button>
          <a className="btn ghost" href={this.props.home ?? '/'}>
            На головну
          </a>
        </div>
      </div>
    )
  }
}
