'use client';

/**
 * Sentry Provider Component
 *
 * Initializes Sentry on the client side. This component should wrap
 * the app to ensure errors are captured.
 */

import { useEffect } from 'react';

// Import Sentry client config (side effect)
import '../../sentry.client.config';

export function SentryProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Sentry is initialized via the import above
    // This useEffect is just to confirm initialization
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      console.debug('Sentry client initialized');
    }
  }, []);

  return <>{children}</>;
}
