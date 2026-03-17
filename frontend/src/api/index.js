const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Parses response and throws a consistent error on non-2xx
async function parseResponse(res) {
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message = body?.error || `Request failed with status ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return body;
}

// Retries on network errors and 5xx — never on 4xx (caller's fault)
async function fetchWithRetry(url, options = {}, retries = 2) {
  const delays = [500, 1000];
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.status >= 500 && attempt < retries) {
        lastErr = new Error(`Server error ${res.status}`);
        await new Promise(r => setTimeout(r, delays[attempt]));
        continue;
      }
      return parseResponse(res);
    } catch (err) {
      // Network-level error (no response) — retry
      lastErr = err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, delays[attempt]));
      }
    }
  }
  throw lastErr;
}

export async function fetchOrders({ page = 1, limit = 50 } = {}) {
  return fetchWithRetry(`${API_BASE}/orders?page=${page}&limit=${limit}`);
}

export async function fetchOrder(id) {
  return fetchWithRetry(`${API_BASE}/orders/${id}`);
}

export async function createOrder(data) {
  return fetchWithRetry(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }, 0); // no retries on mutations
}

export async function updateOrderStatus(id, status) {
  return fetchWithRetry(`${API_BASE}/orders/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  }, 0); // no retries on mutations
}

export async function fetchCustomers() {
  return fetchWithRetry(`${API_BASE}/customers`);
}

export async function searchCustomers(name) {
  return fetchWithRetry(`${API_BASE}/customers/search?name=${encodeURIComponent(name)}`);
}

export async function createCustomer(data) {
  return fetchWithRetry(`${API_BASE}/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }, 0); // no retries on mutations
}

export async function fetchProducts() {
  return fetchWithRetry(`${API_BASE}/products`);
}
