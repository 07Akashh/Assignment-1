# Bug Report — Order Management System

This document identifies 8 issues found across the backend, frontend, and infrastructure of the Order Management System.

---

## Bug 1: SQL Injection in Customer Search

| | |
|---|---|
| **Severity** | 🔴 Critical — Security |
| **File** | `backend/src/routes/customers.js`, line 20 |
| **Function** | `GET /api/customers/search` |

### What It Is
The customer search endpoint builds a SQL query using direct string concatenation of the user-supplied `name` query parameter. This is a textbook SQL injection vulnerability.

```js
// VULNERABLE CODE
const query = "SELECT * FROM customers WHERE name ILIKE '%" + name + "%'";
const result = await pool.query(query);
```

### Why It Matters
An attacker can inject arbitrary SQL by passing a crafted `name` value. For example:
```
GET /api/customers/search?name=' OR '1'='1
```
This would return all rows. More destructively, payloads like `'; DROP TABLE customers; --` could destroy data. This is an OWASP Top 10 vulnerability.

### How to Fix
Use a parameterized query. The `pg` library already supports this:
```js
const result = await pool.query(
  'SELECT * FROM customers WHERE name ILIKE $1',
  [`%${name}%`]
);
```

---

## Bug 2: Hardcoded Database Credentials

| | |
|---|---|
| **Severity** | 🔴 Critical — Security |
| **File** | `backend/src/config/db.js`, lines 5–9 |

### What It Is
Database credentials (`user`, `password`, `host`, `database`) are hardcoded directly in the source file.

```js
const pool = new Pool({
  user: 'admin',
  password: 'admin123',  // ← hardcoded secret
  host: 'db',
  port: 5432,
  database: 'orderdb',
});
```

### Why It Matters
Any developer with read access to the repository (or a git history viewer) can see production credentials. This violates the principle of separating configuration from code (12-Factor App). If the repo were ever made public or leaked, the database would be immediately compromised.

### How to Fix
Read credentials from environment variables:
```js
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST || 'db',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
});
```
Then pass them in `docker-compose.yml` via the `environment` block.

---

## Bug 3: N+1 Query in GET /orders

| | |
|---|---|
| **Severity** | 🟠 High — Performance |
| **File** | `backend/src/routes/orders.js`, lines 7–31 |
| **Function** | `GET /api/orders` |

### What It Is
The endpoint first fetches all orders (1 query), then loops over every order and fires 2 additional queries — one to fetch the customer name and one to fetch the product name. This is the classic N+1 query pattern.

```js
// 1 query to get all orders
const ordersResult = await pool.query('SELECT * FROM orders ...');

for (const order of orders) {
  // 2 more queries PER ORDER — N+1!
  const customerResult = await pool.query('SELECT name, email FROM customers WHERE id = $1', [...]);
  const productResult  = await pool.query('SELECT name, price FROM products WHERE id = $1', [...]);
}
```

With 100 orders, this results in **201 database round trips**.

### Why It Matters
This makes the endpoint increasingly slow as data grows. Each database round trip has network and query-planning overhead. The `GET /orders/:id` endpoint in the same file already demonstrates the correct approach using JOINs — it just was not applied to the list route.

### How to Fix
Replace the loop with a single JOIN query:
```js
const result = await pool.query(
  `SELECT o.*, c.name AS customer_name, c.email AS customer_email,
          p.name AS product_name, p.price AS product_price
   FROM orders o
   JOIN customers c ON o.customer_id = c.id
   JOIN products p ON o.product_id = p.id
   ORDER BY o.created_at DESC`
);
res.json(result.rows);
```

---

## Bug 4: Race Condition in Order Creation (No Transaction)

| | |
|---|---|
| **Severity** | 🟠 High — Data Integrity |
| **File** | `backend/src/routes/orders.js`, lines 57–92 |
| **Function** | `POST /api/orders` |

### What It Is
The order creation flow reads inventory, checks it, creates the order, then decrements inventory — as three separate, non-atomic database operations. There is no transaction or row-level lock.

```js
// Step 1: Read inventory
const productResult = await pool.query('SELECT * FROM products WHERE id = $1', [product_id]);
// ... check inventory_count >= quantity ...

// Step 2: Insert order (separate operation)
const orderResult = await pool.query('INSERT INTO orders ...');

// Step 3: Decrement inventory (separate operation)
await pool.query('UPDATE products SET inventory_count = inventory_count - $1 ...');
```

### Why It Matters
Two concurrent requests for the same product can both pass the inventory check simultaneously (both see `inventory_count = 1`), both create an order, and both decrement — resulting in `inventory_count = -1`. This allows selling stock that doesn't exist, causing fulfilment failures and customer complaints.

### How to Fix
Wrap everything in a PostgreSQL transaction and use `SELECT ... FOR UPDATE` to lock the product row:
```js
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // Locks the row — concurrent requests block here until this transaction commits
  const productResult = await client.query(
    'SELECT * FROM products WHERE id = $1 FOR UPDATE', [product_id]
  );
  // ... check inventory, create order, decrement ...
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
} finally {
  client.release();
}
```

---

## Bug 5: Global Error Handler Always Returns HTTP 200

| | |
|---|---|
| **Severity** | 🟠 High — Reliability |
| **File** | `backend/src/index.js`, lines 24–27 |

### What It Is
The Express global error handler swallows all errors and always returns a `200 OK` with `{ success: true }`, regardless of what actually went wrong.

```js
app.use((err, req, res, next) => {
  console.log('Something happened');  // vague log
  res.status(200).json({ success: true }); // ← lies to the caller
});
```

### Why It Matters
Any unhandled error (database failures, thrown exceptions, etc.) will be silently masked. The client receives a successful response even though the operation failed. This makes debugging nearly impossible and breaks any client-side error handling that relies on HTTP status codes (e.g., monitoring, retries, UI feedback).

### How to Fix
```js
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});
```

---

## Bug 6: No Status Transition Validation in PATCH /orders/:id/status

| | |
|---|---|
| **Severity** | 🟡 Medium — Correctness |
| **File** | `backend/src/routes/orders.js`, lines 95–110 |
| **Function** | `PATCH /api/orders/:id/status` |

### What It Is
The status update endpoint accepts any value for `status` and applies it without validating whether the transition is legal. There is no allowlist of valid status values and no transition rules enforced.

```js
const { status } = req.body;
// No validation — any string is accepted
const result = await pool.query(
  'UPDATE orders SET status = $1 ... WHERE id = $2',
  [status, req.params.id]
);
```

### Why It Matters
An order that has been `delivered` can be set back to `pending`, or to any arbitrary string like `"hacked"`. This corrupts historical data and can trigger fulfilment re-processing.

### How to Fix
Validate the status against an allowlist and enforce valid forward-only transitions:
```js
const VALID_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
const ALLOWED_TRANSITIONS = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped:   ['delivered'],
  delivered: [],
  cancelled: [],
};
```

---

## Bug 7: Missing useEffect Dependency in CreateOrder.js

| | |
|---|---|
| **Severity** | 🟡 Medium — Bug (Stale Closure) |
| **File** | `frontend/src/components/CreateOrder.js`, line 27 |

### What It Is
A `useEffect` that looks up the selected product from the `products` array is missing `selectedProduct` from its dependency array.

```js
useEffect(() => {
  if (selectedProduct) {
    const product = products.find(p => p.id === parseInt(selectedProduct));
    setSelectedProductData(product);
  }
}, [products]); // BUG: selectedProduct missing from deps
```

### Why It Matters
When a user changes the selected product in the dropdown, the effect does not re-run because React does not see `selectedProduct` as a dependency. The product info panel (`selectedProductData`) shows stale data from the previously selected product until something else triggers a re-render. The user sees incorrect price/stock information.

### How to Fix
```js
}, [products, selectedProduct]); // add selectedProduct
```

---

## Bug 8: No Debounce on Customer Search Input

| | |
|---|---|
| **Severity** | 🟡 Low — Performance |
| **File** | `frontend/src/components/CustomerSearch.js`, lines 13–23 |

### What It Is
The search input fires an API call on **every single keystroke** with no debouncing.

```js
const handleSearch = async (value) => {
  setQuery(value);
  if (value.length > 0) {
    const data = await searchCustomers(value); // called on every character
    setResults(data);
  }
};
```

### Why It Matters
Typing "Aarav" triggers 5 API requests in rapid succession. This adds unnecessary load to the backend/database, and can cause a race condition where a slower earlier response overwrites a faster later one, showing stale results.

### How to Fix
Use a debounce (e.g., `setTimeout` / `clearTimeout` or `lodash.debounce`) to wait ~300ms after the user stops typing before firing the request:
```js
const debounceRef = useRef(null);

const handleSearch = (value) => {
  setQuery(value);
  clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(async () => {
    if (value.length > 0) {
      const data = await searchCustomers(value);
      setResults(data);
    } else {
      setResults([]);
    }
  }, 300);
};
```

---

## Summary Table

| # | Issue | Severity | Category |
|---|-------|----------|----------|
| 1 | SQL Injection in `/customers/search` | 🔴 Critical | Security |
| 2 | Hardcoded DB credentials in `db.js` | 🔴 Critical | Security |
| 3 | N+1 query in `GET /orders` | 🟠 High | Performance |
| 4 | Race condition in `POST /orders` (no transaction) | 🟠 High | Data Integrity |
| 5 | Global error handler returns `200` on all errors | 🟠 High | Reliability |
| 6 | No order status transition validation | 🟡 Medium | Correctness |
| 7 | Missing `useEffect` dependency in `CreateOrder.js` | 🟡 Medium | Bug |
| 8 | No debounce on customer search | 🟡 Low | Performance |
