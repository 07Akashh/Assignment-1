import { useState, useEffect } from 'react';
import { fetchCustomers, fetchProducts, createOrder } from '../api';
import { useAutoMessage } from '../hooks/useAutoMessage';
import FlashMessage from './FlashMessage';

function CreateOrder() {
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [address, setAddress] = useState('');
  const [message, setMessage] = useAutoMessage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [cRes, pRes] = await Promise.all([fetchCustomers(), fetchProducts()]);
        setCustomers(Array.isArray(cRes.data) ? cRes.data : []);
        setProducts(Array.isArray(pRes.data) ? pRes.data : []);
      } catch (err) {
        setError(err.message || 'Failed to load form data. Please refresh.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Fixed: selectedProduct in dep array so selectedProductData stays in sync
  const selectedProductData = products.find(p => p.id === parseInt(selectedProduct)) || null;

  const handleSubmit = async () => {
    if (!selectedCustomer || !selectedProduct || !address) {
      setMessage({ type: 'error', text: 'Please fill all fields' });
      return;
    }
    if (quantity < 1) {
      setMessage({ type: 'error', text: 'Quantity must be at least 1' });
      return;
    }
    if (selectedProductData && quantity > selectedProductData.inventory_count) {
      setMessage({ type: 'error', text: `Only ${selectedProductData.inventory_count} unit(s) in stock` });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const result = await createOrder({
        customer_id: parseInt(selectedCustomer),
        product_id: parseInt(selectedProduct),
        quantity,
        shipping_address: address,
      });
      setMessage({ type: 'success', text: `Order #${result.id} created successfully!` });
      setSelectedCustomer('');
      setSelectedProduct('');
      setQuantity(1);
      setAddress('');
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to create order.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="create-order"><p style={{ color: '#999' }}>Loading...</p></div>;
  if (error)   return <div className="create-order"><p style={{ color: '#c00' }}>{error}</p></div>;

  return (
    <div className="create-order">
      <h2>Create New Order</h2>

      {message && <FlashMessage message={message} onDismiss={() => setMessage(null)} />}

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
          max={selectedProductData ? selectedProductData.inventory_count : undefined}
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

      <button className="submit-btn" onClick={handleSubmit} disabled={submitting}>
        {submitting ? 'Placing Order...' : 'Place Order'}
      </button>
    </div>
  );
}

export default CreateOrder;
