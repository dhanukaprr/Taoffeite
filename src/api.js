export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const bodyIsForm = options.body instanceof FormData;
  if (options.body && !bodyIsForm) headers['Content-Type'] = 'application/json';
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...options,
    headers,
    body: options.body && !bodyIsForm && typeof options.body !== 'string'
      ? JSON.stringify(options.body)
      : options.body
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const error = new Error(payload?.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export function money(value, currency = 'USD', selectedCurrency = 'USD') {
  if (value == null) return 'Sealed';
  const rates = { USD: 1, LKR: 302.5, GBP: 0.77 };
  const usd = Number(value) / (rates[currency] || 1);
  const converted = usd * (rates[selectedCurrency] || 1);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: selectedCurrency,
    maximumFractionDigits: selectedCurrency === 'LKR' ? 0 : 2
  }).format(converted);
}

export function formatDate(value, includeTime = true) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    ...(includeTime ? { timeStyle: 'short' } : {})
  }).format(new Date(value));
}
