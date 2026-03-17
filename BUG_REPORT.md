# Bug Report

## 1. SQL injection in customer search
- What: Customer search builds SQL with string concatenation.
- Where: `backend/src/routes/customers.js` GET `/search`.
- Why it matters: Allows SQL injection, data exposure, and potential data loss.
- How to fix: Use parameterized queries and validate/trim the search term.

## 2. N+1 query pattern on order list
- What: Orders endpoint queries customers and products inside a loop.
- Where: `backend/src/routes/orders.js` GET `/`.
- Why it matters: Performance degrades linearly with order count and adds database load.
- How to fix: Replace with a single JOIN query that returns order, customer, and product fields.

## 3. Order creation race condition and non-atomic inventory updates
- What: Inventory is read and decremented in separate statements without a transaction.
- Where: `backend/src/routes/orders.js` POST `/`.
- Why it matters: Concurrent requests can oversell inventory and create inconsistent orders.
- How to fix: Wrap in a transaction and lock the product row (SELECT ... FOR UPDATE) before updating.

## 4. Invalid order status transitions allowed
- What: Any status can be set, including moving from delivered back to pending.
- Where: `backend/src/routes/orders.js` PATCH `/:id/status`.
- Why it matters: Breaks order state integrity and downstream reporting.
- How to fix: Validate against an allowed status list and enforce forward-only transitions.

## 5. Global error handler returns HTTP 200 on failure
- What: Errors are swallowed and always return success.
- Where: `backend/src/index.js` error middleware.
- Why it matters: Clients cannot distinguish success vs failure, hides incidents and breaks monitoring.
- How to fix: Log the error and return a 5xx response with a safe error message.

## 6. Unstable keys in order list
- What: Uses array index as key in a sortable list.
- Where: `frontend/src/components/OrderList.js`.
- Why it matters: React can reuse incorrect rows, leading to UI mismatches after sorting.
- How to fix: Use `order.id` as the row key.
