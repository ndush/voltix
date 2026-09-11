'use client';

// Catches failures in the root layout itself, which the route-level
// boundary cannot reach. It must render its own <html> and <body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          background: '#0b0e14',
          color: '#e6e8eb',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          margin: 0,
          padding: 20,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, marginBottom: 12 }}>
            Voltix is temporarily unavailable
          </h1>
          <p style={{ color: '#b0b6c0', fontSize: 14, lineHeight: 1.5 }}>
            Something failed while loading the application. Your Deriv account
            is unaffected.
          </p>
          {error.digest && (
            <p style={{ color: '#6b7280', fontSize: 12, marginTop: 12 }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 20,
              background: '#ff444f',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 20px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
