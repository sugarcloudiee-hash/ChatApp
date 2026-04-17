function App() {
  return (
    <main className="app-shell" aria-label="Realtime chat and synchronized streaming app">
      <iframe
        className="legacy-frame"
        src="/legacy.html"
        title="Realtime Chat"
        loading="eager"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </main>
  )
}

export default App
