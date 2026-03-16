# BUG REPORT

---

## Issues Index

**Critical — 4 issues**
1. SQL injection in customer search
2. Database credentials hardcoded in source
3. CORS open to all origins
4. Error handler always responds HTTP 200

**High — 6 issues**
5. No transaction on order creation
6. Floating point arithmetic used for currency
7. Foreign keys in orders table are nullable
8. Status updates have no transition rules
9. No server-side input validation anywhere
10. Inventory endpoint sets absolute value, not delta

**Medium — 25 issues**

  Security
  11. No rate limiting on any endpoint
  12. No HTTP security headers

  Infrastructure
  13. Non-production Dockerfiles
  14. Backend never receives DB env vars
  15. DB readiness not verified before startup
  16. No restart policy in docker-compose

  Performance
  17. N+1 queries on orders list endpoint
  18. No indexes on foreign keys or status column
  19. SELECT * used in every query
  20. ILIKE search with leading wildcard bypasses indexes
  21. Order creation makes 3 round trips instead of 1
  22. Search fires API call on every keystroke
  23. No pagination on list endpoints

  Reliability
  24. Frontend shows blank screen on API failure
  25. API client never checks HTTP response status
  26. No retry on transient API failures
  27. Health check endpoint doesn't test the DB
  28. No graceful shutdown on SIGTERM
  29. No request logging

  Data Integrity & API Design
  30. Inconsistent HTTP status codes across API
  31. Order history shows current price, not historical
  32. Search term not URL-encoded before fetch
  33. Seed data never decrements inventory for seeded orders
  34. Place Order button allows double-submit

  Schema
  35. No CHECK constraints on numeric columns

**Low — 8 issues**
  36. Missing dependency in useEffect
  37. Array index used as React list key
  38. No client-side inventory guard
  39. No database trigger for updated_at
  40. DB pool errors are unhandled
  41. Timestamps stored without timezone
  42. Foreign key cascade behavior not defined
  43. Status update makes 2 round trips instead of 1

---

## Critical

---

### 1. SQL Injection in Customer Search

**Location:** `backend/src/routes/customers.js` — `GET /search`, line 14

The search endpoint builds its SQL query by concatenating the raw `name` query parameter directly into the string. A single crafted request can exfiltrate every row in the database, modify data, or drop tables entirely. This is an OWASP Top 10 vulnerability and the most exploitable issue in this codebase — it requires no authentication and no special tooling to abuse.

What makes it particularly glaring is that every other query in the same file already uses parameterized placeholders correctly. This is an isolated regression, not a systemic misunderstanding.

**Fix:** Switch to a parameterized query, passing the wildcard-wrapped value as a bound parameter rather than embedding it in the query string. The `pg` driver handles this natively — no library changes needed.

---

### 2. Database Credentials Hardcoded in Source Code

**Location:** `backend/src/config/db.js` lines 5–9, `docker-compose.yml` lines 7–9

The database username, password, host, and database name are all hardcoded in committed source files. Anyone with read access to the repository — current or former — has full database credentials. Credentials in code also cannot be rotated without a code change, a review cycle, and a redeployment.

If this repository is ever exposed (accidental public push, a disgruntled developer, a leaked archive), the database is immediately accessible to anyone who finds it.

**Fix:** All connection parameters should be read from environment variables at runtime. The `.env` file used to supply those values must be added to `.gitignore` and must never be committed. The `docker-compose.yml` should pass these variables through to both the `db` and `backend` services using variable interpolation rather than literal values.

---

### 3. CORS Open to All Origins

**Location:** `backend/src/index.js` line 10

Calling `cors()` with no configuration is equivalent to adding `Access-Control-Allow-Origin: *`. Any website on the internet can make requests to this API from a visitor's browser. While the app has no authentication today, this is the foundation for a cross-site request forgery attack the moment any session-based auth is added — and it's a pattern that should never be established.

**Fix:** Pass an explicit `origin` allowlist to the `cors()` middleware, sourced from an environment variable so it can differ between local, staging, and production. Requests from unlisted origins should be rejected with a 403.

---

### 4. Global Error Handler Always Returns HTTP 200

**Location:** `backend/src/index.js` lines 24–27

The Express global error handler catches every unhandled error, logs "Something happened", and responds with `{ success: true }` and an HTTP 200 status. Clients have no way to detect that an operation failed, error-rate monitoring cannot fire alerts, and debugging becomes nearly impossible because failures are silently swallowed. The log message also provides zero diagnostic context — when something breaks in production, there is nothing to investigate.

**Fix:** Return HTTP 500 with a structured error body. Log the full error object including the stack trace, and include at minimum the request method and path. Do not expose raw error messages to clients in production, but log everything server-side.

---

## High

---

### 5. No Transaction on Order Creation — Inventory Can Go Negative

**Location:** `backend/src/routes/orders.js` — `POST /` handler

The order creation flow executes three separate, uncoordinated database operations: read the inventory count, insert the order row, then decrement inventory. There is no transaction and no row-level lock between the read and the write.

Under concurrent load, two requests for the same product can both read `inventory_count = 1`, both pass the stock check independently, both insert an order, and both decrement — leaving the inventory at -1. This is a classic overselling race condition that causes failed fulfilment, manual intervention, and customer complaints.

**Fix:** The entire sequence — stock check, order insert, inventory decrement — must run inside a single PostgreSQL transaction. The product row must be locked with `SELECT ... FOR UPDATE` at the start so concurrent requests queue behind the lock rather than reading stale inventory. The connection must be explicitly acquired from the pool, and both `COMMIT` and `ROLLBACK` must be called before releasing it.

---

### 6. Floating Point Arithmetic Used for Currency Calculations

**Location:** `backend/src/routes/orders.js` — `POST /`, line 73

The order total is computed as `product.price * quantity` in JavaScript. The `price` column is stored as `DECIMAL(10,2)` in PostgreSQL, but the `pg` driver returns it as a JavaScript string used in arithmetic. JavaScript's floating point (IEEE 754) cannot exactly represent all decimal fractions — multiplications involving values like 19.99 or 149.95 regularly produce results like 39.980000000000004 rather than 39.98. Those rounding errors get written to `total_amount` and shown to customers.

This is not theoretical. It is a reproducible precision loss at specific price points.

**Fix:** Do the multiplication inside the SQL query itself using PostgreSQL's native `DECIMAL` arithmetic, which is exact. Pass `price` and `quantity` to the database and let it compute `price * quantity` as part of the `INSERT`. Never use raw JavaScript multiplication for currency.

---

### 7. Foreign Keys in the Orders Table Are Nullable

**Location:** `db/init.sql` — orders table, lines 21–22

Both `customer_id` and `product_id` are defined without `NOT NULL`. PostgreSQL allows a NULL foreign key by default, meaning an order can be inserted with no customer and no product. If the application validation in Issue 9 is bypassed or absent, the database silently accepts an order row that references nothing.

An order without a customer or product is meaningless data, and there is no business scenario where either should be optional.

**Fix:** Add `NOT NULL` to both foreign key columns: `customer_id INTEGER NOT NULL REFERENCES customers(id)` and `product_id INTEGER NOT NULL REFERENCES products(id)`. This makes the database the last line of defence rather than trusting application code alone.

---

### 8. Status Updates Have No Transition Validation

**Location:** `backend/src/routes/orders.js` — `PATCH /:id/status`

The endpoint accepts any string as the new status and writes it directly. There is no check that the value is a known status and no enforcement of forward-only transitions. A delivered order can be rolled back to pending. An arbitrary string like `"hacked"` can be written to the column. The schema has no CHECK constraint to catch this either.

This corrupts the order audit trail and breaks any downstream system that depends on status values being predictable.

**Fix:** Define an explicit allowlist of valid statuses and a transition map specifying which moves are legal from each state. Validate both on every update — first that the target status exists, then that the transition from the current status is permitted. Add a `CHECK` constraint to the schema as a second line of defence.

---

### 9. No Server-Side Input Validation on Any Write Endpoint

**Location:** `backend/src/routes/customers.js` — `POST /`, `backend/src/routes/orders.js` — `POST /`

Neither write endpoint validates anything before touching the database. A customer can be created with no name and no email. An order can be placed with quantity zero or negative — which passes the inventory check (`0 < 50` is true) and then decrements inventory by a negative value, actually increasing stock. There is no email format check, no type check on numeric fields, and no required-field enforcement.

Server-side validation is not optional. Client-side validation is cosmetic and trivially bypassed by calling the API directly.

**Fix:** Every write endpoint must validate all required fields are present and of the correct type before touching the database. For orders: quantity must be a positive integer, customer and product IDs must be provided. For customers: name must be non-empty, email must match a valid format. Return HTTP 400 with a descriptive message on any violation.

---

### 10. Inventory Endpoint Sets an Absolute Value Instead of a Delta

**Location:** `backend/src/routes/products.js` — `PATCH /:id/inventory`, line 32

The endpoint accepts an `inventory_count` value and writes it directly: `SET inventory_count = $1`. Callers must know the current stock level before making the request, and two concurrent adjustment calls silently overwrite each other — whichever lands last wins. A restock of +50 and an order decrement of -1 happening simultaneously will lose one of the changes entirely. There is also no validation that the incoming value is a number, or that it is non-negative.

**Fix:** Redesign the endpoint to accept a signed delta (`{ adjustment: 50 }` for a restock, `{ adjustment: -5 }` for a correction) and apply it as a relative update inside a transaction. Reject any adjustment that would push the count below zero. This makes concurrent calls safe and makes each call's intent explicit in logs and audit trails.

---

## Medium

---

### 11. No Rate Limiting on Any Endpoint

**Location:** `backend/src/index.js` — global middleware

There is no rate limiting on any route. The customer search endpoint is the most exposed — it accepts arbitrary input, hits the database on every call, and before fixing Issue 22 was already called on every keystroke. A script looping requests against it can saturate the database connection pool and bring the entire backend down. Order creation is equally unprotected, making it trivial to flood the system with fraudulent orders or deplete inventory through automated requests.

**Fix:** Apply a rate limiter at the Express middleware level using `express-rate-limit`. A sensible starting configuration is 100 requests per minute per IP for read routes, with a stricter ceiling (10–20 per minute) on mutation endpoints like order creation.

---

### 12. No HTTP Security Headers

**Location:** `backend/src/index.js` — middleware setup

The backend sets no HTTP security headers. Every response is missing `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Content-Security-Policy`. Without these the application is open to clickjacking, MIME-type sniffing, and information leakage through the `X-Powered-By: Express` header sent by default.

**Fix:** Add the `helmet` package and mount it as the first middleware in `index.js`. Helmet sets sensible defaults for all of the above headers in one call and disables `X-Powered-By` automatically.

---

### 13. Both Dockerfiles Are Development Configurations

**Location:** `backend/Dockerfile`, `frontend/Dockerfile`

Both images use the full `node:18` base (~1GB) rather than `node:18-alpine`. Neither uses multi-stage builds, so dev dependencies are in production images. There is no `.dockerignore`, meaning local `node_modules`, `.env` files, and `.git` history can be baked into the image silently. Most critically, the frontend runs `react-scripts start` — the Webpack dev server — which has no compression, no static asset caching, and serves unminified code. Containers run as root with no `USER` directive.

**Fix:** Use multi-stage builds with `node:18-alpine`. For the frontend, compile a production build in the first stage and serve with `nginx:alpine` in the final stage. Add `.dockerignore` covering `node_modules`, `.env`, and `.git`. Add a non-root user before `CMD`.

---

### 14. Backend Never Receives Database Credentials from docker-compose

**Location:** `docker-compose.yml` — `backend` service, lines 17–23

The `db` service defines `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` as environment variables. The `backend` service receives only `PORT`. Because credentials are hardcoded in `db.js` this works by coincidence — but the moment hardcoded values are replaced with environment variable reads (which they must be per Issue 2), the backend will fail to connect with no useful error.

**Fix:** Add `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` to the backend's environment block in `docker-compose.yml`, sourcing them from the same `.env` file used by the `db` service.

---

### 15. Backend Starts Before the Database Is Ready

**Location:** `docker-compose.yml` — `depends_on` under `backend`, line 22

`depends_on: db` only ensures the PostgreSQL container has started — it does not wait for the database process inside to be ready to accept connections. On a cold start, particularly with `init.sql` running seed data, the backend frequently attempts its first query before PostgreSQL is ready and crashes with a connection refused error. The container then stays down until manually restarted.

**Fix:** Add a `healthcheck` to the `db` service using `pg_isready`, and change the backend's `depends_on` to use `condition: service_healthy`. This guarantees the backend only starts after PostgreSQL is genuinely ready to serve connections.

---

### 16. No Restart Policy in docker-compose

**Location:** `docker-compose.yml` — all three service definitions

None of the services define a `restart` policy. If any container crashes, Docker leaves it stopped with no automatic recovery. In any production-adjacent environment this means downtime until someone manually runs `docker compose up`.

**Fix:** Add `restart: unless-stopped` to each service. For the database specifically, `restart: always` is more appropriate since PostgreSQL should never be expected to stay down after a crash.

---

### 17. N+1 Query Problem on the Orders List Endpoint

**Location:** `backend/src/routes/orders.js` — `GET /` handler, lines 8–28

The endpoint fetches all orders in one query, then loops over every result and fires two additional queries per order — one for the customer name, one for the product name. With 100 orders this is 201 database round trips. With 1,000 it is 2,001. Latency grows linearly with table size.

The single-order endpoint in the same file (`GET /:id`) already uses the correct approach with a JOIN. The list endpoint simply never got the same treatment.

**Fix:** Replace the loop with a single JOIN query across `orders`, `customers`, and `products` — identical in structure to the existing single-order query.

---

### 18. No Indexes on Frequently Queried Columns

**Location:** `db/init.sql` — schema definition

The `orders` table has `customer_id`, `product_id`, and `status` columns that appear in every meaningful query, but none have indexes. Every JOIN and every filter on these columns performs a full sequential scan. With 8 seed rows this is invisible; with real data volume it becomes a hard bottleneck.

**Fix:** Add indexes on `orders.customer_id`, `orders.product_id`, `orders.status`, and `orders.created_at DESC` in `init.sql`.

---

### 19. SELECT * Used in Every Query

**Location:** `backend/src/routes/customers.js`, `orders.js`, `products.js` — all query statements

Every query uses `SELECT *`. The `products` table has a `description TEXT` column — a potentially large field — fetched on every product list, every order fetch, and every inventory check, even when only `price` and `inventory_count` are needed. Beyond bandwidth waste, `SELECT *` prevents PostgreSQL from using index-only scans. It also means any sensitive column added to a table in the future will be silently exposed to all callers.

**Fix:** Replace `SELECT *` with explicit column lists in every query. The product lookup inside order creation only needs `price` and `inventory_count`. Explicit column selection is also self-documenting — it makes clear at a glance what each query depends on.

---

### 20. Customer Search Uses ILIKE With a Leading Wildcard, Bypassing All Indexes

**Location:** `backend/src/routes/customers.js` — `GET /search`

The search query uses `ILIKE '%name%'` — a pattern with a leading wildcard. PostgreSQL's B-tree indexes scan from the left side of a string. A leading `%` means the match can start anywhere, making the index useless — every search reads every row in the table. Adding a regular index on `name` will not help this pattern.

**Fix:** Enable the `pg_trgm` extension (built into PostgreSQL, no installation needed). It indexes strings as overlapping 3-character chunks via a GIN index, allowing `ILIKE '%name%'` to use the index for fast partial matches on large tables. Add `CREATE EXTENSION IF NOT EXISTS pg_trgm` and `CREATE INDEX idx_customers_name_trgm ON customers USING GIN (name gin_trgm_ops)` to `init.sql`. No query changes are needed — PostgreSQL automatically uses the trigram index. Also add a minimum length guard in the route handler to reject single-character searches before they reach the database.

---

### 21. Order Creation Makes 3 Database Round Trips Where 1 Would Do

**Location:** `backend/src/routes/orders.js` — `POST /` handler

The order creation flow makes three sequential database calls: read and lock the product row, insert the order, decrement inventory. Even inside a transaction this is three network round trips. All three can be expressed as a single atomic CTE (Common Table Expression) query executed in one shot by the database.

The CTE updates inventory only if sufficient stock exists. If inventory is insufficient the update matches zero rows, the downstream insert has no input and inserts nothing, and the result set comes back empty — which the application detects as failure. This is fully atomic at the database level with no `BEGIN`/`COMMIT` needed in application code and is the pattern used in production order systems that need high throughput.

**Fix:** Replace the three-step sequence with a single CTE query that combines the inventory check, decrement, and order insert into one atomic database operation. The application logic becomes: send one query, check if a row was returned, respond accordingly.

---

### 22. Search Fires an API Request on Every Keystroke

**Location:** `frontend/src/components/CustomerSearch.js` — `handleSearch` function

There is no debounce on the search input. Every character typed triggers an immediate HTTP request. Beyond unnecessary backend load, responses are not guaranteed to arrive in order — a slow earlier response can overwrite the results for a later, more complete term, showing stale data.

**Fix:** Debounce the handler with a 300ms delay using `setTimeout`/`clearTimeout` via a ref. Cancel the pending timer on each new keystroke and fire the request only once the user pauses. Use an abort controller or sequence counter to discard out-of-order responses.

---

### 23. No Pagination on List Endpoints

**Location:** `backend/src/routes/orders.js` — `GET /`, `backend/src/routes/customers.js` — `GET /`

Both list endpoints return every row unconditionally. As data grows, every page load triggers a full table scan and transfers the entire dataset regardless of how many rows are visible on screen. The frontend then holds all rows in memory and sorts client-side, compounding the problem.

**Fix:** Add `limit` and `offset` query parameters with sensible defaults (50 records per page). The response should include the total row count alongside the page of results so the frontend can render pagination controls.

---

### 24. Frontend Shows a Blank Screen When API Calls Fail

**Location:** `frontend/src/components/OrderList.js`, `CreateOrder.js` — initial `useEffect` hooks

Neither component handles API failures. If the backend is down the orders table silently renders empty. If the error handler (Issue 4) returns a JSON error object instead of an array, calling `.map()` on it throws a runtime crash. There is also no loading indicator, so users cannot tell whether data is loading or simply absent.

**Fix:** Wrap fetch calls in try/catch. Maintain `loading` and `error` state and render appropriate UI for each — a spinner while loading, an error message on failure. Check whether the response is the expected shape before using it.

---

### 25. API Client Never Checks HTTP Response Status

**Location:** `frontend/src/api/index.js` — all exported functions

Every fetch wrapper calls `.json()` on the response regardless of whether the request succeeded or failed. A 400, 404, or 500 response silently returns a parsed error object that the component treats as valid data, or throws an unpredictable parse error if the body is not JSON. There is no point in the client where `res.ok` is checked before proceeding.

**Fix:** Every fetch wrapper should check `res.ok` after the request completes. If false, throw an error including the HTTP status code and any message from the response body. This gives every caller a consistent, catchable error.

---

### 26. No Retry on Transient API Failures

**Location:** `frontend/src/api/index.js` — all exported functions

Any network hiccup, backend container restart, or brief database blip causes an immediate hard failure with no recovery attempt. For read operations in particular — fetching orders, fetching the product list — a single silent retry would recover the vast majority of transient failures without the user knowing. This fix depends on Issue 25 being in place first, since retries only make sense once the client can reliably detect failure.

**Fix:** Introduce a retry utility that re-attempts failed requests up to two additional times with exponential backoff (500ms then 1000ms). Retry only on network errors and 5xx responses — never on 4xx, which indicate a problem with the request itself. After all attempts are exhausted, propagate the error normally for the component to display.

---

### 27. Health Check Endpoint Does Not Test Database Connectivity

**Location:** `backend/src/index.js` — `GET /api/health`

The health check responds with `{ status: 'ok' }` unconditionally. A container orchestrator or load balancer probing this endpoint receives a healthy response even if the database has been unreachable for the past hour and every order request is failing.

**Fix:** Execute a cheap `SELECT 1` query against the database and return 503 if it fails. The response body should distinguish between the application being up and the database being reachable, so operators can tell at a glance which layer is degraded.

---

### 28. No Graceful Shutdown on SIGTERM

**Location:** `backend/src/index.js` — no signal handling

When Docker stops the backend container it sends `SIGTERM`. With no signal handler registered, Node.js exits immediately on the next event loop tick. In-flight HTTP requests are dropped mid-response. If an order creation transaction is between `BEGIN` and `COMMIT` when the signal arrives, the transaction is rolled back and the client receives no response — no idea whether the order was placed.

**Fix:** Register a `SIGTERM` handler that stops accepting new connections, waits for in-flight requests to complete (10 second timeout), drains the database pool, then exits. Express's `server.close()` combined with a pool drain achieves this with zero dropped requests during normal restarts.

---

### 29. No Request Logging

**Location:** `backend/src/index.js` — middleware setup

The backend emits no access logs. There is no record of which routes are called, from which IPs, with what response codes, or how long requests take. There is no way to detect unusual traffic patterns, trace a specific request, diagnose a performance regression, or audit what happened before an incident.

**Fix:** Add `morgan` middleware before the route handlers. The `dev` format is readable in development; `combined` (Apache-style) integrates with log aggregation in production. A two-line change that pays operational dividends immediately.

---

### 30. Inconsistent HTTP Status Codes Across the API

**Location:** `backend/src/routes/orders.js` — `POST /`, and all route files generally

The order creation endpoint responds HTTP 200 on success when it should return 201 Created. All mutation responses look identical to read responses from an HTTP client's perspective. The response shape is also inconsistent — successful responses return raw row objects while error responses return `{ error: '...' }` — so clients have no predictable way to check success without inspecting content rather than status.

**Fix:** Use 201 for all resource creation responses. Standardise on a consistent response shape — `{ data: ... }` on success and `{ error: '...' }` on failure — giving clients a single contract to program against.

---

### 31. Order History Displays Current Product Price, Not Price at Time of Order

**Location:** `backend/src/routes/orders.js` — `GET /` and `GET /:id` JOIN queries

Both order fetch endpoints join `products` to retrieve the current `p.price AS product_price`. If a product is repriced, every historical order for that product immediately shows a different unit price than the one the customer paid, even though `total_amount` was correctly captured at order time. This causes confusion in any reconciliation, refund, or dispute scenario.

**Fix:** Add a `unit_price` column to the `orders` table to capture the price at the moment of purchase. Populate it during order creation. Change list and detail queries to return `o.unit_price` rather than joining back to the live product price.

---

### 32. Search Term Not URL-Encoded Before Fetch

**Location:** `frontend/src/api/index.js` — `searchCustomers` function

The name parameter is interpolated directly into the fetch URL without `encodeURIComponent`. Names containing an ampersand split the query string into multiple parameters. Names with a hash truncate the URL. Apostrophes, accented letters, and spaces common in real names can all corrupt the request.

**Fix:** Wrap the name in `encodeURIComponent` before interpolating it into the URL string.

---

### 33. Seed Data Never Decrements Inventory for Seeded Orders

**Location:** `db/init.sql` — seed `INSERT` statements, lines 48–56

The seed script inserts 8 orders but never adjusts inventory. Every product starts at its seeded stock level as if no orders have ever been placed. The seeded orders consume 11 units across five products, but inventory figures never reflect this. From the first run, the stock counts shown to users are wrong — Wireless Earbuds shows 50 available when 3 have already been ordered.

**Fix:** After the order seed inserts, add `UPDATE` statements to decrement each product's inventory by the quantity ordered. The database should start in a self-consistent state.

---

### 34. Place Order Button Allows Double-Submit

**Location:** `frontend/src/components/CreateOrder.js` — `handleSubmit` and submit button, lines 29–52 and 110

The button has no disabled state and no in-flight guard. While the `createOrder` request is pending it remains fully clickable. A double-click or impatient second click fires two identical order requests concurrently, both of which may succeed — creating two identical orders and double-decrementing inventory. Slow networks and mobile taps make this a regular occurrence in production.

**Fix:** Track a `submitting` boolean in state. Set it to `true` before the fetch call and `false` in the finally block. Pass it as the `disabled` prop on the button and change the button text to "Placing Order…" while in-flight.

---

### 35. No CHECK Constraints on Critical Numeric Columns

**Location:** `db/init.sql` — products and orders table definitions

Several numeric columns have no range constraints at the database level:

- `products.inventory_count` — no lower bound. A direct SQL query or future endpoint miscalculation can push this negative despite the application-level transaction fix in Issue 5.
- `products.price` — no lower bound. A zero or negative price corrupts order totals.
- `orders.quantity` — no positivity check. A zero or negative quantity passes schema validation silently.
- `orders.total_amount` — no lower bound. A negative order total affects financial reporting.

**Fix:** Add `CHECK (inventory_count >= 0)`, `CHECK (price > 0)`, `CHECK (quantity > 0)`, and `CHECK (total_amount > 0)` to the respective column definitions. These permanently prevent an entire class of invalid data from entering the system regardless of which code path writes it.

---

## Low

---

### 36. Missing Dependency in useEffect Causes Stale Product Info

**Location:** `frontend/src/components/CreateOrder.js` — second `useEffect`, line 52

The effect that resolves the selected product from the products array lists only `products` as a dependency, omitting `selectedProduct`. React only re-runs the effect when the product list changes — not when the user changes their dropdown selection. The product info panel continues to show data for the previously selected product until some other state change triggers a re-render, meaning users see incorrect pricing and stock information.

**Fix:** Add `selectedProduct` to the dependency array. Handle the cleared state by setting `selectedProductData` to `null` in the else branch.

---

### 37. Array Index Used as React Key on a Sortable List

**Location:** `frontend/src/components/OrderList.js` — `sortedOrders.map`, line 70

The orders table uses the array index as the `key` prop for each row. When sort order changes, the data in each position changes but the keys do not, so React reuses existing DOM nodes in place. The status dropdown in each row retains its prior DOM state, causing the wrong status to be displayed and submitted for orders after any sort interaction.

**Fix:** Use `order.id` as the key — stable, unique, and unaffected by sort order changes.

---

### 38. No Client-Side Inventory Guard Before Placing Order

**Location:** `frontend/src/components/CreateOrder.js` — `handleSubmit` and quantity input

The form shows available stock but does not prevent the user from entering a quantity greater than stock or a number below 1. The server rejects these, but the user only discovers this after a full round trip. A zero-quantity order also passes the client entirely since no check exists.

**Fix:** Validate quantity in `handleSubmit` before making the API call — check it is at least 1 and does not exceed available stock. Set the `max` attribute on the quantity input to available inventory.

---

### 39. updated_at Is Not Maintained by the Database

**Location:** `db/init.sql` — orders schema

The `orders` table has an `updated_at` column but no trigger to keep it current. The only place it is updated is in the `PATCH /status` route via a manual `updated_at = NOW()`. Any future update pathway — a new endpoint, a migration script, a data fix — that omits this clause will leave `updated_at` stale silently.

**Fix:** Add a `BEFORE UPDATE` trigger on the `orders` table that sets `updated_at = NOW()` automatically, moving responsibility to the database where it belongs.

---

### 40. Database Pool Errors Are Not Handled

**Location:** `backend/src/config/db.js`

The `pg.Pool` is created with no `error` event listener. In Node.js, an unhandled `error` event on an EventEmitter throws an uncaught exception and terminates the process. A network hiccup or database restart emits an error event and the entire backend crashes with no warning.

**Fix:** Attach an `error` listener to the pool that logs the event and allows the process to continue. The pool manages reconnection automatically — the listener only prevents the unhandled event from becoming a fatal crash.

---

### 41. Timestamps Stored Without Timezone Information

**Location:** `db/init.sql` — all `TIMESTAMP DEFAULT NOW()` columns across all three tables

All timestamp columns are `TIMESTAMP` (without time zone). If the database server's timezone is changed or the application is deployed in a different region, stored timestamps will be interpreted incorrectly. Range queries, sorting, and duration calculations across a timezone change produce wrong results silently.

**Fix:** Change all timestamp columns to `TIMESTAMPTZ` (`TIMESTAMP WITH TIME ZONE`). PostgreSQL normalises to UTC on write and converts on read, making timestamps unambiguous regardless of where the server runs.

---

### 42. Foreign Key Cascade Behavior Not Defined

**Location:** `db/init.sql` — `orders` table, `customer_id` and `product_id` references

Both foreign keys reference parent tables without specifying `ON DELETE` behavior. PostgreSQL's default (`NO ACTION`) means deleting a customer or product with existing orders fails with a constraint error. This is implicit, undocumented, and produces an opaque error. There is also no defined path for retiring a product or closing a customer account.

**Fix:** Make the intent explicit. Add `ON DELETE RESTRICT` to make the protection deliberate rather than accidental. Better still, implement a soft-delete pattern — an `archived_at` timestamp — on both customers and products so records can be deactivated without breaking referential integrity.

---

### 43. Status Update Makes 2 Round Trips Where 1 Would Do

**Location:** `backend/src/routes/orders.js` — `PATCH /:id/status` handler

With proper transition validation (Issue 8), the status update first fetches the current order status, validates the transition in application code, then runs the update as a second query. The transition check can be pushed into the `WHERE` clause of the `UPDATE` itself — update the row only if the current status is one of the valid prior states. If not, the `UPDATE` matches zero rows, detected the same way as "order not found."

**Fix:** Replace the two-query sequence with a single `UPDATE ... WHERE id = $1 AND status = ANY($2) RETURNING *`, where `$2` is the array of valid prior statuses for the requested transition. One round trip, atomically safe.

---
