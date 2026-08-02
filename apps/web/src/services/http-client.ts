import axios from 'axios';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';
import {
  createLoginRedirector,
  createProgressTracker,
  extractErrorMessage
} from './http-client-utils';
import { attachHttpInterceptors, downloadBlobWithClient } from './http-client-pipeline';

export { extractErrorMessage };
export type { RetryableConfig } from './http-client-utils';

NProgress.configure({ showSpinner: false, trickleSpeed: 200, minimum: 0.1 });
const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  // Heavy cold aggregates (recommend/ops-console) can take >30s on first load; the
  // backend now pre-warms these caches on boot, so 30s covers rare cache-miss cases
  // without blocking the UI for over a minute when the server is unreachable.
  timeout: 30000
});
let authRestoreInflight: Promise<string | null> | null = null;
const inFlightControllers = new Map<string, AbortController>(),
  progress = createProgressTracker(),
  loginRedirector = createLoginRedirector();
function abortAllInflight() {
  for (const [, ctrl] of inFlightControllers) {
    try {
      ctrl.abort();
    } catch {
      /* ignore */
    }
  }
  inFlightControllers.clear();
}
attachHttpInterceptors({
  client,
  inFlightControllers,
  startProgress: () => progress.start(() => NProgress.start()),
  endProgress: () => progress.end(() => NProgress.done()),
  redirectToLogin: () => loginRedirector.redirect(abortAllInflight),
  getAuthRestoreInflight: () => authRestoreInflight,
  setAuthRestoreInflight: (value) => {
    authRestoreInflight = value;
  },
  isRedirecting: () => loginRedirector.isRedirecting
});
export default client;
export const downloadBlob = (url: string, filename: string) =>
  downloadBlobWithClient(client, url, filename);
