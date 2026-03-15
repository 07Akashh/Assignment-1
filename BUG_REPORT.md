# Bug Report — Order Management System

**Date:** 2026-03-15
**Scope:** Full-stack review (backend, frontend, database, infrastructure)
**Environment:** Node.js 18 / Express 4.18 / React 18 / PostgreSQL 15 / Docker Compose

**Prioritization Note:** Issues are ranked by real-world production impact — security, data integrity, reliability, and user experience. At an startup, every user interaction matters. A single broken order, a wrong price displayed, or a silent failure that no one notices can erode the trust you're still building. Having worked on systems at a previous startup that broke under real traffic, I've learned that issues like race conditions, missing error handling, and invisible failures don't show up during development — they surface when real users and real money are involved. The ranking reflects what I'd fix before going live vs. what can wait a sprint.

### Triage Summary

| Priority | Issues | Action |
|----------|--------|--------|
| **Fix before launch** | #1 SQL Injection, #2 Race Condition, #3 Silent Error Handler, #4 Quantity Validation | These can lose data, lose money, or expose customer PII. Non-negotiable. |
| **Fix in first sprint** | #5 N+1 Query, #6 Status Validation, #7 Frontend Error Handling | Will degrade experience quickly as usage grows. Low effort, high payoff. |
| **Fix soon** | #8 Stale Product Info, #9 React Key Bug, #10 Customer Validation | UI correctness issues. Won't cause data loss but will confuse users. |

---

## 1. SQL Injection in Customer Search

**Severity:** Critical
**Category:** Security
**Location:** `backend/src/routes/customers.js`, line 20

```js
const query = "SELECT * FROM customers WHERE name ILIKE '%" + name + "%'";
```

**Impact:**
The `name` query parameter is concatenated directly into the SQL string with no sanitization. An attacker can craft a request like:

```
GET /api/customers/search?name=' OR 1=1; DROP TABLE orders; --
```

This gives full read/write/delete access to the database. For a startup handling real customer data — names, emails, phone numbers — this is a data breach waiting to happen. One incident like this early on and you lose user trust permanently. It also creates legal exposure even before you're thinking about compliance.

**Fix:** Use a parameterized query — the `pg` driver already supports this:

```js
router.get('/search', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) {
      return res.status(400).json({ error: 'Search term is required' });
    }
    const result = await pool.query(
      'SELECT * FROM customers WHERE name ILIKE $1',
      [`%${name}%`]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});
```

---

## 2. Race Condition and Missing Transaction in Order Creation

**Severity:** Critical
**Category:** Data Integrity
**Location:** `backend/src/routes/orders.js`, lines 62–86

```js
// Step 1: Read inventory (no lock)
const productResult = await pool.query('SELECT * FROM products WHERE id = $1', [product_id]);
// Step 2: Check in application code
if (product.inventory_count < quantity) { ... }
// Step 3: Insert order
const orderResult = await pool.query('INSERT INTO orders ...', [...]);
// Step 4: Decrement inventory
await pool.query('UPDATE products SET inventory_count = inventory_count - $1 ...', [quantity, product_id]);
```

There are two compounding problems here:

1. **Race condition:** Two concurrent requests both read `inventory_count = 1`, both pass the check, both create orders. The product is oversold.
2. **No transaction:** These are four independent queries. If the server crashes or the decrement fails after the order INSERT succeeds, you have an order in the database but inventory was never decremented. The system is now permanently out of sync.

**Impact:**
Overselling means a customer pays for something you can't deliver — that's a refund, an apology email, and probably a lost user. At an early stage, you might not even notice because the error handler (Issue #3) swallows the failure. The missing transaction makes this worse: any partial failure leaves the database in an inconsistent state that requires someone to manually fix rows in production.

**Fix:** Wrap everything in a transaction and use an atomic `UPDATE ... WHERE` to eliminate the read-check-write race:

```js
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { customer_id, product_id, quantity, shipping_address } = req.body;

    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'Quantity must be a positive integer' });
    }

    await client.query('BEGIN');

    // Atomic check-and-decrement: returns nothing if insufficient stock
    const inventoryResult = await client.query(
      `UPDATE products
       SET inventory_count = inventory_count - $1
       WHERE id = $2 AND inventory_count >= $1
       RETURNING price`,
      [quantity, product_id]
    );

    if (inventoryResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Product not found or insufficient inventory' });
    }

    const total_amount = inventoryResult.rows[0].price * quantity;

    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, product_id, quantity, total_amount, shipping_address, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [customer_id, product_id, quantity, total_amount, shipping_address]
    );

    await client.query('COMMIT');
    res.status(201).json(orderResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to create order' });
  } finally {
    client.release();
  }
});
```

---

## 3. Global Error Handler Silently Returns 200 OK

**Severity:** High
**Category:** Reliability / Observability
**Location:** `backend/src/index.js`, lines 24–27

```js
app.use((err, req, res, next) => {
  console.log('Something happened');
  res.status(200).json({ success: true });
});
```

**Impact:**
Every unhandled exception is swallowed. The client receives `200 OK` with `{ success: true }` even when the server has failed. In a small team where you're probably the one debugging issues:

- **You won't know things are broken:** If you're tailing logs or checking uptime, everything looks green. Users are hitting errors, but your system says 100% success.
- **Clients can't recover:** The frontend has no way to detect failures and show the user an error message or retry.
- **Debugging becomes guesswork:** `console.log('Something happened')` with no error object, no stack trace, no request context. When a user reports "my order didn't go through," you have nothing to go on.

**Fix:**

```js
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err.stack);
  res.status(500).json({ error: 'Internal server error' });
});
```

---

## 4. No Quantity Validation on Order Creation

**Severity:** High
**Category:** Data Integrity
**Location:** `backend/src/routes/orders.js`, line 59

```js
const { customer_id, product_id, quantity, shipping_address } = req.body;
// quantity is used directly — no validation
```

**Impact:**
The `quantity` field is never validated anywhere in the stack. This allows:

- **Negative quantity (e.g., `-5`):** The inventory decrement query (`inventory_count - $1`) becomes `inventory_count - (-5)` which *adds* 5 to stock. An attacker can inflate inventory indefinitely.
- **Zero quantity:** Creates an order for `total_amount = 0` — a free order.
- **Floating point (e.g., `0.001`):** Creates orders for fractional items with near-zero total amounts.

This is not a theoretical concern — any API client (curl, Postman, a malicious script) can send these values directly. The frontend's `min="1"` on the input field is trivially bypassed.

**Fix:** Validate before any business logic (included in the transaction fix above):

```js
if (!Number.isInteger(quantity) || quantity < 1) {
  return res.status(400).json({ error: 'Quantity must be a positive integer' });
}
```

---

## 5. N+1 Query in Order Listing

**Severity:** High
**Category:** Performance
**Location:** `backend/src/routes/orders.js`, lines 9–25

```js
const ordersResult = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
for (const order of orders) {
  const customerResult = await pool.query('SELECT name, email FROM customers WHERE id = $1', [order.customer_id]);
  const productResult = await pool.query('SELECT name, price FROM products WHERE id = $1', [order.product_id]);
}
```

**Impact:**
For `N` orders this executes `2N + 1` queries sequentially. With the current 8 seed orders, that's 17 queries — barely noticeable. But this is the kind of issue that bites you fast: at 500 orders (realistic within the first few months), it's 1,001 sequential queries on every page load. Users will see the order page take 5+ seconds to load, and that's the primary screen they use.

The fix is especially straightforward here — the `GET /:id` endpoint on line 36 already uses a proper JOIN. The pattern exists in the codebase; it just wasn't applied to the list endpoint.

**Fix:** Use a single JOIN query:

```js
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.*,
             c.name AS customer_name, c.email AS customer_email,
             p.name AS product_name, p.price AS product_price
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      JOIN products p ON o.product_id = p.id
      ORDER BY o.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});
```

---

## 6. No Status Transition Validation

**Severity:** High
**Category:** Data Integrity / Business Logic
**Location:** `backend/src/routes/orders.js`, lines 95–110

```js
const { status } = req.body;
// No validation — directly updates
const result = await pool.query(
  'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
  [status, req.params.id]
);
```

**Impact:**
There are two problems:

1. **No transition rules:** A `delivered` order can be moved back to `pending`. A `shipped` order can jump to `pending`. This breaks any downstream process that depends on order state — refund eligibility, shipping triggers, inventory reconciliation.
2. **No value validation:** The status can be set to any arbitrary string (`"foo"`, `""`, `null`). The database has no CHECK constraint to prevent it, so these values are persisted and will break any code that switches on status.

In practice, this means someone (probably a founder managing orders) accidentally drags an order backward, and now your fulfillment logic doesn't know what to do with it.

**Fix:**

```js
const VALID_TRANSITIONS = {
  pending: ['confirmed'],
  confirmed: ['shipped'],
  shipped: ['delivered'],
  delivered: [],
};

router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const current = await pool.query('SELECT status FROM orders WHERE id = $1', [req.params.id]);

    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const currentStatus = current.rows[0].status;
    if (!VALID_TRANSITIONS[currentStatus]?.includes(status)) {
      return res.status(400).json({
        error: `Cannot transition from '${currentStatus}' to '${status}'`,
      });
    }

    const result = await pool.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order status' });
  }
});
```

---

## 7. Frontend API Client Never Checks Response Status

**Severity:** High
**Category:** Reliability
**Location:** `frontend/src/api/index.js`, all 8 functions

```js
export async function fetchOrders() {
  const res = await fetch(`${API_BASE}/orders`);
  return res.json(); // never checks res.ok
}
```

**Impact:**
Every API function blindly calls `res.json()` regardless of HTTP status. This means:

- A `500 Internal Server Error` with body `{ error: "Failed to fetch orders" }` is returned to the component as if it were valid data. `OrderList` then calls `setOrders({ error: "..." })` — an object, not an array — and `[...orders].sort()` crashes the UI with a blank screen.
- A network failure (server down, DNS timeout) causes `fetch()` itself to throw. Since none of the callers have try/catch, the Promise rejects unhandled and the component silently stays in its initial state — a blank screen with no feedback.

For the user, both cases look the same: the app just stops working with no explanation.

**Fix:** Add a shared helper with proper error handling:

```js
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || `Request failed with status ${res.status}`);
  }
  return body;
}

export function fetchOrders() {
  return apiFetch(`${API_BASE}/orders`);
}

// ... apply to all other functions
```

---

## 8. Missing `selectedProduct` in useEffect Dependency Array

**Severity:** Medium
**Category:** Correctness
**Location:** `frontend/src/components/CreateOrder.js`, line 27

```js
useEffect(() => {
  if (selectedProduct) {
    const product = products.find(p => p.id === parseInt(selectedProduct));
    setSelectedProductData(product);
  }
}, [products]); // Missing: selectedProduct
```

**Impact:**
The info panel below the product dropdown (showing price, stock, and calculated total) only updates when the `products` array changes — which only happens on initial mount. When a user selects a different product from the dropdown, the panel continues to display the previously selected product's price and inventory.

If the user selects Wireless Earbuds (₹2,499), then switches to Mechanical Keyboard (₹4,599), the panel still shows ₹2,499. The backend calculates the correct amount, so the actual charge differs from what the user saw. This is a trust-breaking experience — the user thinks they're paying ₹2,499 but gets charged ₹4,599.

**Fix:**

```js
useEffect(() => {
  if (selectedProduct) {
    const product = products.find(p => p.id === parseInt(selectedProduct));
    setSelectedProductData(product);
  } else {
    setSelectedProductData(null);
  }
}, [products, selectedProduct]);
```

---

## 9. Array Index Used as React Key on Sortable List

**Severity:** Medium
**Category:** Correctness
**Location:** `frontend/src/components/OrderList.js`, line 62

```jsx
{sortedOrders.map((order, index) => (
  <tr key={index}>
```

**Impact:**
When the user clicks a column header to sort, the data reorders but React sees the same keys (`0, 1, 2, ...`) and reuses the existing DOM nodes. The `<select>` dropdown for status retains its internal DOM state from the previous row that occupied that index position.

Concrete scenario: Order #1 (pending) is at index 0, Order #5 (delivered) is at index 4. After sorting by Total, their positions swap. React reuses the DOM `<select>` at index 0 — which still shows "pending" — but it now belongs to Order #5 which is actually "delivered". The displayed status is wrong, and changing it fires `handleStatusChange` with the wrong order ID. A team member managing orders could accidentally change the wrong order's status without realizing it.

**Fix:**

```jsx
{sortedOrders.map((order) => (
  <tr key={order.id}>
```

The same issue exists in `frontend/src/components/CustomerSearch.js`, line 93 — `key={idx}` should be `key={customer.id}`.

---

## 10. No Input Validation on Customer Creation

**Severity:** Medium
**Category:** Data Integrity
**Location:** `backend/src/routes/customers.js`, lines 42–53

```js
router.post('/', async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    const result = await pool.query(
      'INSERT INTO customers (name, email, phone) VALUES ($1, $2, $3) RETURNING *',
      [name, email, phone]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create customer' });
  }
});
```

**Impact:**
Neither the backend nor the frontend (`CustomerSearch.js`, lines 25–44) validates any fields. The consequences:

- **Empty name/email:** The only protection is the database `NOT NULL` constraint, which returns a raw 500 with `"Failed to create customer"` — the user has no idea what went wrong.
- **Invalid email format:** `"notanemail"` is stored. Any downstream process that sends email (order confirmations, shipping notifications) will fail silently or bounce.
- **Duplicate email:** The database `UNIQUE` constraint catches this, but again — just a generic 500 instead of telling the user "this email already exists."
- **Missing body entirely:** `name`, `email`, `phone` are all `undefined`, which PostgreSQL will reject.

The frontend (`CustomerSearch.js`) also has no validation — the "Save Customer" button fires immediately with whatever is in the fields.

**Fix:**

```js
router.post('/', async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }

    const result = await pool.query(
      'INSERT INTO customers (name, email, phone) VALUES ($1, $2, $3) RETURNING *',
      [name.trim(), email.trim().toLowerCase(), phone?.trim() || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A customer with this email already exists' });
    }
    res.status(500).json({ error: 'Failed to create customer' });
  }
});
```
