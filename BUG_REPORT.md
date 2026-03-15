# Bug Report — Order Management System

## 1. SQL Injection in Customer Search (CRITICAL — Security)

**What:** The customer search endpoint uses string concatenation to build SQL queries, allowing attackers to inject arbitrary SQL.

**Where:** `backend/src/routes/customers.js`, Line 20

```javascript
const query = "SELECT * FROM customers WHERE name ILIKE '%" + name + "%'";
```

**Why:** An attacker can pass a crafted `name` parameter (e.g., `'; DROP TABLE customers; --`) to execute arbitrary SQL — leading to data theft, modification, or complete database compromise.

**How to fix:** Use parameterized queries:

```javascript
const result = await pool.query(
  'SELECT * FROM customers WHERE name ILIKE $1',
  ['%' + name + '%']
);
```

---

## 2. N+1 Query Problem in Get All Orders (MEDIUM — Performance)

**What:** Fetching orders executes 1 + 2N database queries (1 for orders, then 2 per order for customer and product details).

**Where:** `backend/src/routes/orders.js`, Lines 7–31

**Why:** For 100 orders, this results in 201 database queries instead of 1. Response time degrades linearly with the number of orders, causing slow page loads and unnecessary database load.

**How to fix:** Replace the loop with a single JOIN query:

```javascript
const result = await pool.query(`
  SELECT o.*, c.name as customer_name, c.email as customer_email,
         p.name as product_name, p.price as product_price
  FROM orders o
  JOIN customers c ON o.customer_id = c.id
  JOIN products p ON o.product_id = p.id
  ORDER BY o.created_at DESC
`);
```

---

## 3. Race Condition in Order Creation (HIGH — Data Integrity)

**What:** Inventory check and decrement are done in separate, non-transactional queries. Two concurrent requests can both pass the inventory check and oversell.

**Where:** `backend/src/routes/orders.js`, Lines 57–92

**Why:** If `inventory_count = 1` and two requests arrive simultaneously, both read `1`, both pass the check, both create orders, and inventory goes to `-1`. This leads to overselling and negative inventory.

**How to fix:** Wrap the check + insert + decrement in a database transaction with `SELECT ... FOR UPDATE`:

```javascript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const productResult = await client.query(
    'SELECT * FROM products WHERE id = $1 FOR UPDATE', [product_id]
  );
  // ... check inventory, create order, decrement ...
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```

---

## 4. Broken Global Error Handler (HIGH — Correctness)

**What:** The global error handler catches all errors but returns HTTP 200 with `{ success: true }`, silently swallowing every error.

**Where:** `backend/src/index.js`, Lines 23–27

```javascript
app.use((err, req, res, next) => {
  console.log('Something happened');
  res.status(200).json({ success: true });
});
```

**Why:** Clients cannot detect failures — they always receive a success response. This makes debugging impossible and violates the HTTP API contract.

**How to fix:**

```javascript
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});
```

---

## 5. No Order Status Transition Validation (MEDIUM — Business Logic)

**What:** The status update endpoint accepts any status value without validating the transition. An order can go from `delivered` back to `pending`.

**Where:** `backend/src/routes/orders.js`, Lines 95–110

**Why:** Breaks business rules — delivered orders shouldn't become pending again. This can cause incorrect order tracking, financial discrepancies, and logistics issues.

**How to fix:** Define valid transitions and validate before updating:

```javascript
const validTransitions = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};
```

---

## 6. Hardcoded Database Credentials (MEDIUM — Security)

**What:** Database username and password are hardcoded in the source code.

**Where:** `backend/src/config/db.js`, Lines 4–10

**Why:** Anyone with repository access can see the production database credentials. Credentials should never be committed to version control.

**How to fix:** Use environment variables and pass them via `docker-compose.yml`:

```javascript
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST || 'db',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'orderdb',
});
```

---

## 7. Missing useEffect Dependency in CreateOrder (MEDIUM — Correctness)

**What:** The `useEffect` that computes `selectedProductData` depends on `selectedProduct` but it is not listed in the dependency array.

**Where:** `frontend/src/components/CreateOrder.js`, Lines 22–27

```javascript
useEffect(() => {
  if (selectedProduct) {
    const product = products.find(p => p.id === parseInt(selectedProduct));
    setSelectedProductData(product);
  }
}, [products]); // Missing: selectedProduct
```

**Why:** When the user changes the product dropdown, the effect doesn't re-run, so the product summary card shows stale data from the previously selected product.

**How to fix:** Add `selectedProduct` to the dependency array: `[products, selectedProduct]`

---

## 8. Unstable React Keys on Sortable List (MEDIUM — Correctness)

**What:** The order list uses array index as React `key` on a list that can be sorted.

**Where:** `frontend/src/components/OrderList.js`, Line 62

```javascript
{sortedOrders.map((order, index) => (
  <tr key={index}>
```

**Why:** When the list is re-sorted, React thinks the same DOM nodes are still rendering the same data (since key=0 stays key=0). This causes incorrect state retention — e.g., status dropdowns show values from the wrong orders.

**How to fix:** Use `order.id` as the key: `<tr key={order.id}>`

---

## 9. No Error Handling in Frontend API Calls (MEDIUM — UX/Reliability)

**What:** The `fetchOrders()` call in `OrderList` has no `.catch()` handler, and there is no loading or error state.

**Where:** `frontend/src/components/OrderList.js`, Lines 10–12

**Why:** If the backend is down or returns an error, the promise rejection is unhandled and the user sees a blank screen with no indication of what went wrong.

**How to fix:** Add error/loading state:

```javascript
const [error, setError] = useState(null);
useEffect(() => {
  fetchOrders()
    .then(data => setOrders(data))
    .catch(() => setError('Failed to load orders'));
}, []);
```

---

## 10. No Debounce on Customer Search (LOW — Performance)

**What:** The customer search fires an API call on every keystroke with no debouncing.

**Where:** `frontend/src/components/CustomerSearch.js`, Lines 15–23

**Why:** Typing "hello" triggers 5 API calls. On slow connections, responses can arrive out of order, showing results for an earlier query. Also adds unnecessary load on the backend.

**How to fix:** Add a debounce (300ms) before firing the API call, or use `setTimeout`/`clearTimeout` to delay the search.

---

## 11. Missing Input Validation on Customer Creation (MEDIUM — Data Quality)

**What:** Neither the frontend nor backend validates customer data before insertion.

**Where:**
- Backend: `backend/src/routes/customers.js`, Lines 42–53
- Frontend: `frontend/src/components/CustomerSearch.js`, Lines 25–32

**Why:** Users can submit empty names/emails or invalid email formats, leading to bad data in the database. The database `NOT NULL` constraint on `name` and `email` will cause a 500 error with no helpful message.

**How to fix:** Add validation on both frontend (before submit) and backend (before query):

```javascript
if (!name?.trim() || !email?.trim()) {
  return res.status(400).json({ error: 'Name and email are required' });
}
```

---

## 12. Dockerfile Uses Full Node Image and No Layer Caching (LOW — Infrastructure)

**What:** Both Dockerfiles use `node:18` (full image ~900MB) and copy all files before `npm install`, breaking Docker layer caching.

**Where:** `backend/Dockerfile` and `frontend/Dockerfile`

**Why:** Every code change invalidates the `npm install` layer, causing full dependency reinstall on every build. The full node image is unnecessarily large for production.

**How to fix:** Use `node:18-alpine`, copy `package*.json` first, then `npm install`, then copy source:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
```
