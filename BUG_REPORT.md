## 1. Added Authentication Middleware to Orders Endpoints

**Change:**
Introduced an authentication middleware in middleware.js using a function which takes a jwt cookie from headers and verifies it with the secret key and used it on line number 35 in index.js so all order-related routes can be accessed by only the  logged-in users.

**Why:**
Orders are user-specific and often contain sensitive information such as purchase history and personal data. Without proper protection, any user (or even an unauthenticated request) could access or manipulate order data.

The middleware solves the following problems:

* **Unauthorized Access:** Prevents non-authenticated users from accessing order endpoints.
* **Data Security:** Ensures users can only interact with their own orders.
* **API Protection:** Adds a security layer before the request reaches the actual route handler.
* **Centralized Logic:** Instead of checking authentication in every route, the middleware handles it in one place, making the code cleaner and easier to maintain.

**Result:**
All order endpoints are now protected, and only authenticated users can perform actions such as viewing, creating, or canceling orders.


## 2. Added Rate Limiting to Prevent API Abuse

**Change:**
Integrated a rate limiting middleware in `index.js` on line number 36 to restrict incoming requests to **50 requests per minute per IP address**.

**Why:**
Public APIs are vulnerable to abuse such as spamming, brute-force attacks, or excessive usage from a single client. Without rate limiting, a malicious user could overwhelm the server, degrade performance, or even cause downtime.

The rate limiter solves the following problems:

* **Prevents API Abuse:** Limits how frequently a client can hit the server.
* **Improves Stability:** Protects the server from being overloaded by too many requests.
* **Enhances Security:** Reduces the risk of brute-force attacks and automated abuse.
* **Fair Usage:** Ensures all users get a fair share of server resources.

**Result:**
Each client (IP) can now make up to 50 requests per minute. If the limit is exceeded, the server responds with a `429 Too Many Requests` error, asking the client to try again later.



## 3. Added User Validation in Create Customer Endpoint (Bug)

**Change:**
Added user input validation in the `create customer` endpoint (`customer.js`, around line 45) to verify incoming request data before processing.

**Why:**
Without proper validation, invalid or missing data (such as undefined fields) could cause runtime errors, leading to server crashes or unexpected behavior.

The validation solves the following problems:

* **Prevents Server Crashes:** Ensures required fields are present and valid before executing logic.
* **Avoids Runtime Errors:** Stops the application from breaking due to undefined or malformed input.
* **Improves Data Integrity:** Guarantees that only valid and structured data is stored in the database.
* **Better Error Handling:** Allows the API to return meaningful error messages instead of failing silently or crashing.

**Result:**
The endpoint is now more robust and reliable, handling invalid input gracefully and preventing the server from crashing.



## 4. Added `return` Statements to Response Handling

**Change:**
Added `return` before `res.json()` / `res.status().json()` in all the route handlers inside the routes folder to ensure the request-response cycle is properly terminated after sending a response.

**Why:**
In Express, sending a response using `res.json()` does not automatically stop further code execution in the function. Without a `return`, the function may continue executing and attempt to send another response, which can lead to errors such as:

> "Cannot set headers after they are sent to the client"

Adding `return` ensures that once a response is sent, no additional code runs.

This solves the following problems:

* **Prevents Multiple Responses:** Stops accidental sending of multiple responses for a single request.
* **Avoids Runtime Errors:** Eliminates "headers already sent" errors.
* **Improves Code Clarity:** Makes it clear that execution should stop after responding.
* **Ensures Proper Flow Control:** Helps maintain a predictable request-response lifecycle.

**Result:**
The API now safely terminates execution after sending a response, preventing bugs and improving overall reliability.



## 5. Added Custom Async Handler for Route Handlers

**Change:**
Implemented a custom `asyncHandler` utility to wrap all asynchronous route handlers inside the routes folder, eliminating the need for repetitive `try-catch` blocks in each endpoint.

**Why:**
In Express applications, handling asynchronous code typically requires wrapping every route in a `try-catch` block to catch errors. This leads to repetitive and cluttered code, reducing readability and maintainability.

The custom async handler centralizes error handling by wrapping the route logic and catching any errors in one place.

This solves the following problems:

* **Improves Readability:** Removes repetitive `try-catch` blocks from every route handler.
* **Cleaner Code Structure:** Keeps route handlers focused only on business logic.
* **Centralized Error Handling:** Ensures consistent error responses across all endpoints.
* **Reduces Boilerplate Code:** Avoids duplicating error-handling logic in multiple places.

**Result:**
Route handlers are now cleaner and easier to read, with all asynchronous errors handled in a centralized and consistent manner.


## 6. Configured CORS Options for Controlled Access

**Change:**
Configured CORS middleware inside `index.js` line number 29 with specific options including `origin`, `credentials`, and allowed HTTP methods.

```js
{
  origin: process.env.FRONTEND_ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"]
}
```

**Why:**
By default, browsers block cross-origin requests for security reasons. Without proper CORS configuration, the frontend application would not be able to communicate with the backend API.

This configuration ensures that only requests from a trusted frontend origin are allowed and that secure communication (such as cookies or authentication tokens) can be properly handled.

The configuration solves the following problems:

* **Prevents Unauthorized Access:** Only allows requests from a specified frontend origin.
* **Enables Secure Authentication:** `credentials: true` allows cookies and auth headers to be sent.
* **Controls Allowed Methods:** Restricts API usage to defined HTTP methods.
* **Avoids CORS Errors:** Ensures smooth communication between frontend and backend.

**Result:**
The backend API now securely accepts requests only from the intended frontend application, while supporting authenticated requests and preventing unwanted cross-origin access.


## 7. Prevented SQL Injection in Search Endpoint

**Change:**
Replaced string concatenation in the customer search query with a parameterized query to safely handle user input in customer.js file, line number 23.

**Why:**
Previously, the search endpoint directly inserted user input into the SQL query using string concatenation. This made the application vulnerable to SQL injection attacks, where a malicious user could manipulate the query to access or modify unintended data.

By switching to parameterized queries, user input is treated strictly as data rather than executable SQL code.

This solves the following problems:

* **Prevents SQL Injection Attacks:** Protects the database from malicious input.
* **Ensures Data Security:** Stops unauthorized access to sensitive data.
* **Improves Query Safety:** Separates SQL logic from user-provided values.
* **Enhances Application Stability:** Avoids unexpected behavior caused by malformed queries.

**Result:**
The search endpoint is now secure against SQL injection, ensuring safe handling of user input and protecting the database from potential attacks.




## 8. Added Order Status Transition Validation

**Change:**
Enhanced the order status update endpoint in order.js inside routes folderthe at line 115 to validate both the incoming status value and enforce strict state transitions before updating the order.

**Why:**
Previously, the endpoint allowed any status to be updated directly without validation. This meant an order could move from `delivered` back to `pending` or any other invalid state, leading to inconsistent and unrealistic order flows.

The improvements solve the following problems:

* **Prevents Invalid Status Updates:** Ensures only predefined status values are accepted.
* **Enforces Logical Order Flow:** Restricts transitions (e.g., `pending → confirmed → shipped → delivered`) and blocks invalid jumps.
* **Maintains Data Integrity:** Keeps order lifecycle consistent and predictable.
* **Avoids Business Logic Errors:** Prevents scenarios like reverting completed or cancelled orders.

**Result:**
The order status system is now robust and follows a well-defined lifecycle, ensuring consistency, reliability, and correctness in order management.




## 16. Fixed N+1 Query Problem in Orders Endpoint

**Change:**
Refactored the orders fetching endpoint endpoint in order.js inside routes folderthe at line 8 to replace multiple database queries inside a loop with a single query using SQL joins to retrieve customer and product details along with each order.

**Why:**
Previously, the endpoint fetched all orders first and then executed additional queries for each order to retrieve related customer and product information. This resulted in an **N+1 query problem**, where the number of database queries increased linearly with the number of orders.

This approach caused several issues:

* **Performance Degradation:** Large numbers of orders led to hundreds of database queries, slowing down response time.
* **Poor Scalability:** The endpoint could not handle increasing data efficiently.
* **Increased Database Load:** Excessive queries put unnecessary strain on the database.

By using SQL joins, all required data is fetched in a single query.

This solves the following problems:

* **Eliminates Redundant Queries:** Reduces multiple database calls to a single optimized query.
* **Improves Performance:** Faster response times even with large datasets.
* **Enhances Scalability:** Efficient handling of growing data.
* **Simplifies Code:** Removes the need for manual data enrichment in loops.

**Result:**
The orders endpoint is now significantly more efficient, scalable, and performant, providing all required data in a single database query.









## . Added Order Cancellation Endpoint

**Change:**
Created a new endpoint to allow cancelling an order using its `id`. The endpoint updates the order status to `cancelled` and restores the product inventory accordingly.

**Why:**
Previously, there was no safe way to cancel an order once it was created. This could lead to inconsistent data, especially when inventory was already reduced during order creation.

The implementation solves the following problems:

* **Prevents Invalid State Changes:** Ensures that orders cannot be cancelled after being delivered or already cancelled.
* **Maintains Inventory Consistency:** Restores the deducted inventory when an order is cancelled.
* **Avoids Race Conditions:** Uses database-level locking and transactions to ensure safe concurrent operations.
* **Improves Data Integrity:** Guarantees that order status and inventory remain in sync.

**Result:**
The system now supports safe and reliable order cancellation while maintaining correct inventory and order state consistency.
