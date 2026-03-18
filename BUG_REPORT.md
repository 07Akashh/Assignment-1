# Bug Report

This document outlines the bugs, security vulnerabilities, and architectural issues identified in the Order Management System.

---

## 1. SQL Injection Vulnerability

- **Location**: `backend/src/routes/customers.js` (Line 20 in `GET /search`)
- **Impact**: **Critical (Security)**. The search endpoint uses direct string concatenation with user-provided input (`name`). An attacker could manipulate the query to extract sensitive data from other tables, bypass filters, or even delete data depending on database permissions.
- **Fix**: Use parameterized queries (prepared statements) provided by the `pg` library.

## 2. N+1 Query Problem

- **Location**: `backend/src/routes/orders.js` (Lines 14-25 in `GET /`)
- **Impact**: **High (Performance)**. The endpoint fetches all orders first, then executes two additional queries per order to fetch customer and product details. If there are 100 orders, it makes 201 database calls. This causes significant latency and database load as the data grows.
- **Fix**: Use a single `JOIN` query to fetch orders along with their customer and product information in one go.
- **Next-Level Optimization**: Added **pagination** (Limit/Offset) and implemented explicit column selection to reduce memory overhead. Suggest adding indices on `customer_id`, `product_id`, and `created_at` in the `orders` table to speed up joins and sorting.

## 3. Race Condition in Order Creation

- **Location**: `backend/src/routes/orders.js` (Lines 57-86 in `POST /`)
- **Impact**: **High (Data Integrity)**. The code reads inventory, checks it in JS, then updates it in a separate statement. There is no database transaction. Concurrent requests could both read the same inventory level, pass the check, and result in negative inventory or "overselling" products.
- **Fix**: Use a database transaction (`BEGIN`, `COMMIT/ROLLBACK`) and include the inventory check within the transaction or use a single `UPDATE` with a `WHERE` clause to ensure atomsity.

## 4. API Error swallowing

- **Location**: `backend/src/index.js` (Lines 24-27)
- **Impact**: **Medium (Reliability/Debugging)**. The global error handler catches all errors but always returns a `200 OK` status with `{ success: true }`. This makes it impossible for clients to know if an operation actually failed and hides server-side bugs during development.
- **Fix**: Update the error handler to return appropriate HTTP status codes (e.g., 500) and log the actual error for debugging.

## 5. Dangerous Use of Array Index as React Key

- **Location**: `frontend/src/components/OrderList.js` (Line 61)
- **Impact**: **Low/Medium (Correctness/Performance)**. The order list uses the array index as the `key` prop while the list is sortable. This can lead to UI bugs where state (like input focus or local component state) is incorrectly preserved across different items when the list re-orders.
- **Fix**: Use the unique order ID (`order.id`) as the React key.

## 6. Lack of Loading and Error States

- **Location**: `frontend/src/components/OrderList.js`
- **Impact**: **Medium (User Experience)**. If the API call fails or is slow, the user is left with a blank screen or a frozen UI with no indication of what's happening.
- **Fix**: Implement `loading` and `error` states using `useState` and show appropriate fallback UI.

## 7. Stale Closures and Missing Dependencies in Hooks

- **Location**: `frontend/src/components/OrderList.js`, `frontend/src/components/CreateOrder.js`
- **Impact**: **Medium (Correctness)**. UI to show stale data (e.g., wrong product price) when state changed.
- **Fix**: Refactor state derivation to be reactive or include all necessary dependencies in hooks.

## 8. Excessive API Calls (Lack of Debounce)

- **Location**: `frontend/src/components/CustomerSearch.js`
- **Impact**: **Medium (Performance)**. The search endpoint was hammered with requests on every single keystroke, leading to poor performance and potential rate limiting.
- **Fix**: Implemented a 500ms debounce using `setTimeout` within a `useEffect` hook.

---

---

## Fixed Identified Issues

- [x] **Lack of Input Validation**: Added structured validation to `POST /api/customers`, `PATCH /api/products/:id/inventory`, and all frontend forms.
- [x] **No Status Transition Logic**: Implemented backend and frontend safeguards for order workflow.
- [x] **Frontend Reliability**: Implemented `loading`, `error`, and `submitting` states across all major components.
- [x] **Performance Optimization**: Added debouncing for searches and pagination for long lists.
- [x] **Hook Accuracy**: Fixed all missing dependency warnings and stale state bugs in React hooks.
