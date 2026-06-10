/**
 * Secure Fetch Wrapper
 * Automatically attaches the CSRF token for web-based requests to prevent Cross-Site Request Forgery.
 */

function getCookie(name) {
  if (typeof document === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

export async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  
  // Attach CSRF token for state-changing requests if running on the web
  if (options.method && !['GET', 'HEAD', 'OPTIONS'].includes(options.method.toUpperCase())) {
    const csrfToken = getCookie('acetrack_csrf');
    if (csrfToken) {
      headers.set('x-csrf-token', csrfToken);
    }
  }

  // Ensure content-type is set for JSON payloads if not explicitly provided
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
     headers.set('Content-Type', 'application/json');
  }

  const enhancedOptions = {
    ...options,
    headers
  };

  // 🛡️ Ensure credentials (cookies) are included for web requests
  if (typeof document !== 'undefined' && !enhancedOptions.credentials) {
    enhancedOptions.credentials = 'include';
  }

  return fetch(url, enhancedOptions);
}
