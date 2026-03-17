# Bug Report

This document outlines multiple issues identified across the backend, frontend, and infrastructure layers.

## 1) SQL Injection in Customer Search
- **Issue**: The SQL query is constructed using direct string concatenation of user input, making it vulnerable to SQL injection attacks.  
- **Location**: `backend/src/routes/customers.js` (`router.get('/search', ...)`)  
- **Impact**: This is a critical security flaw that could allow attackers to execute arbitrary SQL queries, potentially exposing or altering sensitive data.  
- **Recommendation**: Use parameterized queries (prepared statements) and validate/sanitize all user inputs.

## 2) Incorrect Status Code in Global Error Handler
- **Issue**: The global error-handling middleware always responds with `200 OK`, even when errors occur.  
- **Location**: `backend/src/index.js` (global error handler)  
- **Impact**: Masks server-side failures, misleads clients, and makes debugging difficult.  
- **Recommendation**: Return appropriate HTTP status codes (e.g., 500 for server errors), log errors properly, and send structured error responses.

## 3) N+1 Query Problem in Orders Endpoint
- **Issue**: The API fetches orders and then performs additional queries for each order to retrieve related customer and product data.  
- **Location**: `backend/src/routes/orders.js` (`router.get('/', ...)`)  
- **Impact**: Leads to significant performance issues due to excessive database calls, especially with large datasets.  
- **Recommendation**: Replace multiple queries with a single optimized query using JOINs.

## 4) Race Condition in Order Creation
- **Issue**: The order creation flow reads inventory, inserts the order, and updates inventory in separate steps without using transactions.  
- **Location**: `backend/src/routes/orders.js` (`router.post('/', ...)`)  
- **Impact**: Can result in data inconsistency and overselling under concurrent requests.  
- **Recommendation**: Use database transactions and atomic updates to ensure consistency and prevent race conditions.

## 5) Hardcoded Database Credentials
- **Issue**: Database credentials are directly embedded in the source code.  
- **Location**: `backend/src/config/db.js`  
- **Impact**: Exposes sensitive information and complicates credential management and rotation.  
- **Recommendation**: Store credentials in environment variables and avoid hardcoding secrets in the codebase.

## 6) Frontend: Missing Loading/Error States and State Issues
- **Issue**: API calls lack proper loading and error handling; some hooks have incomplete dependency arrays.  
- **Location**:  
  - `frontend/src/components/OrderList.js`  
  - `frontend/src/components/CustomerSearch.js`  
  - `frontend/src/components/CreateOrder.js`  
- **Impact**: Results in poor user experience, potential runtime errors, and stale UI updates.  
- **Recommendation**: Implement loading and error states, add debouncing for search inputs, and correct dependency arrays in hooks.

## 7) Frontend: Improper Key Usage in Lists
- **Issue**: Array index is used as the key in list rendering.  
- **Location**: `frontend/src/components/OrderList.js`  
- **Impact**: Can cause UI inconsistencies and rendering issues when list items change order.  
- **Recommendation**: Use stable, unique identifiers such as `order.id` for keys.

## 8) Infrastructure: Exposed Database Port and Plaintext Secrets
- **Issue**: The database port is publicly exposed and credentials are stored in plaintext.  
- **Location**: `docker-compose.yml`  
- **Impact**: Increases security risks and weakens deployment practices.  
- **Recommendation**: Restrict database port exposure, use environment variables or secret management tools, and limit access to internal networks only.