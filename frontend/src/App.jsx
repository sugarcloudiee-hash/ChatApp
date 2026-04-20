import { useMemo, useState } from 'react'

function App() {
  const [frameKey, setFrameKey] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)

  const statusText = useMemo(() => (isLoaded ? 'Live connection ready' : 'Connecting...'), [isLoaded])

  const handleReload = () => {
    setIsLoaded(false)
    setFrameKey((current) => current + 1)
  }

  return (
    <main className="app-shell" aria-label="Realtime chat and synchronized streaming app">
      <div className="ambient-glow" aria-hidden="true" />

      <section className="surface">
        <header className="topbar">
          <div>
            <p className="eyebrow">Realtime Suite</p>
            <h1>Collaborative chat workspace</h1>
          </div>

          <div className="topbar-actions">
            <span className={`status-pill ${isLoaded ? 'ready' : ''}`} aria-live="polite">
              <span className="status-dot" aria-hidden="true" />
              {statusText}
            </span>

            <button type="button" className="ghost-button" onClick={handleReload}>
              Reload session
            </button>
            <a className="primary-button" href="/legacy.html" target="_blank" rel="noreferrer noopener">
              Open in new tab
            </a>
          </div>
        </header>

        <div className="meta-row" aria-label="Workspace highlights">
          <span>Low-latency updates</span>
          <span>Socket sync</span>
          <span>Team-ready interface</span>
        </div>

        <div className="frame-wrap">
          <iframe
            key={frameKey}
            className="legacy-frame"
            src="/legacy.html"
            title="Realtime Chat"
            loading="eager"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setIsLoaded(true)}
          />
        </div>
      </section>
    </main>
  )
}

export default App
