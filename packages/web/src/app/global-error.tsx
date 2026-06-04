'use client';

// global-error.tsx replaces the root layout when an unhandled error occurs.
// It MUST define <html> and <body> tags itself (the root layout is not
// applied). This bypasses the Web3Provider / ToastProvider / next/font tree
// that has been observed to fail the /404 prerender in CI (React error #31).
//
// Used by Next.js as the fallback for /_error during static export.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '4rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '4rem', margin: 0 }}>Something went wrong</h1>
        <p style={{ color: '#666', marginTop: '1rem' }}>
          {error?.digest ? `Error ID: ${error.digest}` : 'An unexpected error occurred.'}
        </p>
        <button
          onClick={() => reset()}
          style={{
            marginTop: '2rem',
            background: '#14b8a6',
            color: 'white',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
