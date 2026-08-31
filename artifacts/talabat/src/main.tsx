import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

// Production is hosted separately from the API on Render. Keep VITE_API_URL
// configurable for other deployments, but use the live API as the production
// default so a missing Vercel environment variable cannot silently break auth.
const apiUrl = import.meta.env.VITE_API_URL || (
  import.meta.env.PROD ? 'https://talabatiweb.onrender.com' : null
);

if (apiUrl) {
  setBaseUrl(apiUrl);
}

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
