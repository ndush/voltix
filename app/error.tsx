'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[voltix] route error', error);
  }, [error]);

  return (
    <main className="boundary">
      <div className="boundary-card">
        <h1>Something went wrong</h1>
        <p>
          The page hit an unexpected error. Your Deriv account and any open
          contracts are unaffected — nothing was placed or cancelled.
        </p>
        {error.digest && <p className="digest">Reference: {error.digest}</p>}
        <div className="boundary-actions">
          <button onClick={reset}>Try again</button>
          <Link href="/">Back to home</Link>
        </div>
      </div>
    </main>
  );
}
