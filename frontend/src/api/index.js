const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

async function parseResponse(res) {
  let body;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed with status ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

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
      lastErr = err;
      if (attempt < retries) await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }
  throw lastErr;
}

// Sends a mutation (POST/PATCH) with no retries — safe for non-idempotent operations
function mutate(method, url, body) {
  const hasBody = body !== undefined;
  return fetchWithRetry(url, {
    method,
    headers: hasBody ? { 'Content-Type': 'application/json' } : {},
    body:    hasBody ? JSON.stringify(body) : undefined,
  }, 0);
}

export const fetchOrders = ({ page = 1, limit = 50 } = {}) =>
  fetchWithRetry(`${API_BASE}/orders?page=${page}&limit=${limit}`);

export const fetchOrder = async (id) => {
  const res = await fetchWithRetry(`${API_BASE}/orders/${id}`);
  return res.data;
};

export const createOrder = async (data) => {
  const res = await mutate('POST', `${API_BASE}/orders`, data);
  return res.data;
};

export const updateOrderStatus = async (id, status) => {
  const res = await mutate('PATCH', `${API_BASE}/orders/${id}/status`, { status });
  return res.data;
};

export const cancelOrder = async (id) => {
  const res = await mutate('POST', `${API_BASE}/orders/${id}/cancel`);
  return res.data;
};

export const fetchCustomers = () => fetchWithRetry(`${API_BASE}/customers`);

export const searchCustomers = async (name) => {
  const res = await fetchWithRetry(`${API_BASE}/customers/search?name=${encodeURIComponent(name)}`);
  return res.data;
};

export const createCustomer = async (data) => {
  const res = await mutate('POST', `${API_BASE}/customers`, data);
  return res.data;
};

export const fetchProducts = () => fetchWithRetry(`${API_BASE}/products`);
