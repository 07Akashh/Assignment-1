import React, { useState, useEffect } from 'react';
import { fetchCustomers, fetchProducts, createOrder } from '../api';

function CreateOrder() {
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState(null);

  // Load customers and products
  useEffect(() => {
    fetchCustomers().then(setCustomers);
    fetchProducts().then(setProducts);
  }, []);

  // BUG: Missing dependency - selectedProduct is used inside but not in dep array.
  // This means `selectedProductData` shows stale info when user changes product selection.
  const [selectedProductData, setSelectedProductData] = useState(null);
  useEffect(() => {
    if (selectedProduct) {
      const product = products.find(p => p.id === parseInt(selectedProduct));
      setSelectedProductData(product);
    }
  }, [products, selectedProduct]); // fixed: added selectedProduct dependency

  const handleSubmit = async () => {
    if (!selectedCustomer || !selectedProduct || !address) {
      setMessage({ type: 'error', text: 'Please fill all fields' });
      return;
    }

    const result = await createOrder({
      customer_id: parseInt(selectedCustomer),
      product_id: parseInt(selectedProduct),
      quantity: quantity,
      shipping_address: address,
    });

    if (result.error) {
      setMessage({ type: 'error', text: result.error });
    } else {
      setMessage({ type: 'success', text: `Order #${result.id} created successfully!` });
      setSelectedCustomer('');
      setSelectedProduct('');
      setQuantity(1);
      setAddress('');
      setSelectedProductData(null);
    }
  };

  return (
    <div className="create-order">
      <h2>Create New Order</h2>

      {message && (
        <div className={`message ${message.type}`}>{message.text}</div>
      )}

      <div className="form-group">
        <label>Customer</label>
        <select value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)}>
          <option value="">Select customer...</option>
          {customers.map(c => (
            <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>Product</label>
        <select value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)}>
          <option value="">Select product...</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>{p.name} - ₹{p.price} (Stock: {p.inventory_count})</option>
          ))}
        </select>
      </div>

      {selectedProductData && (
        <div style={{ padding: '0.5rem', background: '#f0f0f0', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Selected: <strong>{selectedProductData.name}</strong> — ₹{selectedProductData.price} × {quantity} = ₹{(selectedProductData.price * quantity).toLocaleString()}
          <br />
          <small>Available: {selectedProductData.inventory_count} units</small>
        </div>
      )}

      <div className="form-group">
        <label>Quantity</label>
        <input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
        />
      </div>

      <div className="form-group">
        <label>Shipping Address</label>
        <textarea
          rows="2"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Enter shipping address..."
        />
      </div>

      <button className="submit-btn" onClick={handleSubmit}>
        Place Order
      </button>
    </div>
  );
}

export default CreateOrder;
