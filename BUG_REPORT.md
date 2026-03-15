# Bug Report — Order Management System

I reviewed the backend, frontend, and infrastructure. Below are the issues I found, with where they live in the code, why they matter, and how I’d fix them.

---

## 1. SQL injection in customer search

**What’s going on:** The customer search endpoint sticks the user’s search term straight into the SQL string. So someone could send a “name” like `'; DROP TABLE customers; --` and run arbitrary SQL—reading, changing, or wiping data.

**Where:**  
`backend/src/routes/customers.js`, in the `GET /search` handler (around lines 17–20). The problematic bit:

```javascript
const query = "SELECT * FROM customers WHERE name ILIKE '%" + name + "%'";
const result = await pool.query(query);
```

**Why it matters:** This is a serious security hole. Unvalidated input in SQL can lead to full database compromise.

**How I’d fix it:** Use a parameterized query and validate the input. For example:

```javascript
router.get('/search', async (req, res) => {
  try {
    const { name } = req.query;
    if (name == null || String(name).trim() === '') {
      return res.status(400).json({ error: 'Search term required' });
    }
    const result = await pool.query(
      "SELECT * FROM customers WHERE name ILIKE $1",
      ['%' + String(name).trim() + '%']
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});
```

---

## 2. N+1 queries on the orders list

**What’s going on:** When we fetch all orders, we do one query for orders and then, inside a loop, two more queries per order (one for customer, one for product). So for 100 orders we hit the DB 201 times instead of once.

**Where:**  
`backend/src/routes/orders.js`, in the `GET /` handler (lines 7–30). We already do a nice JOIN for a single order in `GET /:id`; the list endpoint doesn’t.

**Why it matters:** Performance. As order count grows, response time and database load grow with it. It’s the classic N+1 problem.

**How I’d fix it:** One query with JOINs, same idea as the single-order endpoint:

```javascript
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*, c.name AS customer_name, c.email AS customer_email,
              p.name AS product_name, p.price AS product_price
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       LEFT JOIN products p ON o.product_id = p.id
       ORDER BY o.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});
```

---

## 3. Inventory race condition (overselling)

**What’s going on:** When creating an order we (1) read the product and check stock, (2) insert the order, (3) then decrement inventory. Two requests at the same time can both see “1 in stock,” both pass the check, and both decrement—so we end up with negative inventory and overselling.

**Where:**  
`backend/src/routes/orders.js`, in the `POST /` handler (roughly lines 56–90): the check, insert, and update are separate steps with no locking.

**Why it matters:** Data integrity. Stock can go negative and we can “sell” more than we have. Reporting and fulfillment both get wrong.

**How I’d fix it:** Make the decrement atomic and conditional. Only create the order if the update actually reduced stock (e.g. use a transaction and an UPDATE that includes `AND inventory_count >= $1`, then check `rowCount` or `RETURNING`). For example:

```javascript
const updateResult = await pool.query(
  `UPDATE products SET inventory_count = inventory_count - $1
   WHERE id = $2 AND inventory_count >= $1
   RETURNING *`,
  [quantity, product_id]
);
if (updateResult.rows.length === 0) {
  return res.status(400).json({ error: 'Insufficient inventory' });
}
// Then INSERT the order. Use a transaction if we need to roll back on insert failure.
```

---

## 4. Global error handler always returns 200

**What’s going on:** The global Express error handler catches everything but always sends HTTP 200 and `{ success: true }`. The only log is “Something happened,” so we lose the real error.

**Where:**  
`backend/src/index.js`, lines 22–26:

```javascript
app.use((err, req, res, next) => {
  console.log('Something happened');
  res.status(200).json({ success: true });
});
```

**Why it matters:** Clients and monitoring can’t tell success from failure. Debugging is harder, and any retry/alert logic that relies on status codes will be wrong.

**How I’d fix it:** Log the real error, send the right status code, and a safe JSON body. For example:

```javascript
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});
```

And make sure route handlers pass errors to `next(err)` so this handler actually runs.

---

## 5. Hardcoded database credentials

**What’s going on:** The DB user, password, host, and database name are hardcoded in `db.js`. Docker Compose sets `POSTGRES_*` for the database container, but the backend service doesn’t get those env vars, so we’re not really using env-based config.

**Where:**  
- `backend/src/config/db.js` (lines 4–9): literal `user`, `password`, `host`, etc.  
- `docker-compose.yml`: the backend service (lines 16–23) has no DB-related `environment` entries.

**Why it matters:** Secrets in code can leak (e.g. via git). We also can’t switch credentials per environment without changing code.

**How I’d fix it:** Read from env in `db.js` with defaults for local dev (e.g. `process.env.PGUSER || 'admin'`, etc.), and in `docker-compose.yml` pass `PGUSER`, `PGPASSWORD`, `PGHOST`, `PGPORT`, `PGDATABASE` into the backend service. For production, use proper secrets and avoid default passwords in the repo.

---

## 6. No input validation

**What’s going on:** Several endpoints take body/query/params and use them without checking types, ranges, or allowed values:

- **Orders POST:** `customer_id`, `product_id`, `quantity`, `shipping_address` — no check that quantity is positive, IDs are valid, or address is present.
- **Orders PATCH status:** Any string is accepted; we don’t restrict to e.g. `pending`, `confirmed`, `shipped`, `delivered` or validate transitions.
- **Products PATCH inventory:** We set `inventory_count` directly, so negative or non-integer values can get through.
- **Customers POST:** No checks on `name`, `email`, `phone` — empty or invalid data can be stored.
- **Customers search:** No handling for missing `name` (especially after we fix the injection).

**Where:**  
- `backend/src/routes/orders.js` (POST `/`, PATCH `/:id/status`)  
- `backend/src/routes/products.js` (PATCH `/:id/inventory`)  
- `backend/src/routes/customers.js` (POST `/`, GET `/search`)

**Why it matters:** We can end up with invalid data (negative stock, bogus statuses, duplicate or useless customers) and confusing DB or runtime errors.

**How I’d fix it:** Add validation before using input—either a small library (e.g. express-validator, Joi) or manual checks. Return 400 with a clear message when something’s wrong. For example: require positive integer quantity and IDs and non-empty address for order creation; allow only a fixed set of statuses for PATCH status; require non-negative integer for inventory; require non-empty name and valid-looking email for customer creation; require/trim `name` for search (as in the SQL injection fix).

---

## 7. Frontend crash when the API fails

**What’s going on:** The frontend API helpers never check `res.ok` or status. On 4xx/5xx they still parse the body and return it. So when the backend returns `{ error: '...' }`, the OrderList (and similar) treats that as data and does `setOrders(data)`. Then `orders` is an object, and `[...orders].sort(...)` blows up (e.g. “not iterable”), so the Orders tab crashes instead of showing an error.

**Where:**  
- `frontend/src/api/index.js` — every `fetch` just does `return res.json()` with no check on `res.ok`.  
- `frontend/src/components/OrderList.js` — lines 10–11 and 22: we set state from the response and then sort assuming an array.

**Why it matters:** One API or network failure can take down the list UI. Users get a broken screen instead of a clear error message.

**How I’d fix it:** In the API layer, treat non-OK responses as errors—e.g. a small `handleResponse(res)` that checks `res.ok`, parses JSON, and throws (or returns a consistent error shape) so callers never treat an error body as success data. In OrderList (and any other list), use `.catch()` on the fetch promise, set an error state, and only sort when we actually have an array (e.g. `Array.isArray(orders) ? [...orders].sort(...) : []` or show an error and keep `orders` as `[]`).

---

## 8. Search query parameter not encoded

**What’s going on:** We build the search URL as `?name=${name}`. If the user types something like “Smith & Co” or “a=b”, the `&` or `=` can break or change the query string, so the backend gets the wrong or truncated search term.

**Where:**  
`frontend/src/api/index.js`, in `searchCustomers(name)` (line 37):

```javascript
const res = await fetch(`${API_BASE}/customers/search?name=${name}`);
```

**Why it matters:** Search can silently return wrong results or fail for perfectly valid names with special characters.

**How I’d fix it:** Encode the parameter: use `encodeURIComponent(name ?? '')` in the URL. If we add the `handleResponse` from issue #7, use that here too so errors are handled consistently.

---

## Summary

| # | Issue                         | Category    | Impact                              |
|---|-------------------------------|-------------|-------------------------------------|
| 1 | SQL injection in search       | Security    | Database compromise                  |
| 2 | N+1 queries on orders         | Performance | Higher latency and DB load          |
| 3 | Inventory race / oversell     | Correctness | Negative stock, overselling          |
| 4 | Error handler returns 200     | API design  | Clients can’t detect failure         |
| 5 | Hardcoded DB credentials      | Security    | Secret leakage, inflexible config    |
| 6 | No input validation           | Integrity   | Invalid data, bad states             |
| 7 | Frontend crash when API fails | Reliability | Broken UI on server/network errors   |
| 8 | Search query not encoded      | Correctness | Wrong or missing search results      |
