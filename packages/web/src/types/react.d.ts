// Fix React 19 type incompatibilities with third-party libraries
// This addresses issues with framer-motion, react-leaflet, wagmi, and @tanstack/react-query
// The core issue is that React 19's stricter ReactNode types don't match older library types

import 'react';

declare module 'react' {
  // Make ReactPortal children optional to match library expectations
  interface ReactPortal {
    children?: ReactNode;
  }
}
