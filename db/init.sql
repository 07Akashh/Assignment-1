-- Schema
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    inventory_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
    shipping_address TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_orders_customer_id  ON orders(customer_id);
CREATE INDEX idx_orders_product_id   ON orders(product_id);
CREATE INDEX idx_orders_status       ON orders(status);
CREATE INDEX idx_orders_created_at   ON orders(created_at DESC);

-- Seed: Customers
INSERT INTO customers (name, email, phone) VALUES
('Aarav Sharma', 'aarav@example.com', '9876543210'),
('Priya Patel', 'priya@example.com', '9876543211'),
('Rohan Gupta', 'rohan@example.com', '9876543212'),
('Sneha Reddy', 'sneha@example.com', '9876543213'),
('Vikram Singh', 'vikram@example.com', '9876543214');

-- Seed: Products
INSERT INTO products (name, description, price, inventory_count) VALUES
('Wireless Earbuds', 'Bluetooth 5.0 earbuds with noise cancellation', 2499.00, 50),
('USB-C Hub', '7-in-1 USB-C hub with HDMI, USB 3.0, SD card', 1899.00, 30),
('Mechanical Keyboard', 'RGB mechanical keyboard with Cherry MX switches', 4599.00, 20),
('Laptop Stand', 'Adjustable aluminum laptop stand', 1299.00, 40),
('Webcam HD', '1080p HD webcam with built-in microphone', 3499.00, 15);

-- Seed: Orders
INSERT INTO orders (customer_id, product_id, quantity, total_amount, status, shipping_address) VALUES
(1, 1, 2, 4998.00, 'delivered', '42 MG Road, Bangalore'),
(2, 3, 1, 4599.00, 'shipped', '15 Park Street, Kolkata'),
(3, 2, 3, 5697.00, 'pending', '88 Connaught Place, Delhi'),
(1, 5, 1, 3499.00, 'pending', '42 MG Road, Bangalore'),
(4, 4, 2, 2598.00, 'confirmed', '23 Jubilee Hills, Hyderabad'),
(5, 1, 1, 2499.00, 'shipped', '7 Marine Drive, Mumbai'),
(2, 2, 1, 1899.00, 'delivered', '15 Park Street, Kolkata'),
(3, 3, 1, 4599.00, 'confirmed', '88 Connaught Place, Delhi');
