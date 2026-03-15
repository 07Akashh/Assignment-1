import React, { useState, useEffect } from 'react';
import { fetchOrders, updateOrderStatus, cancelOrder } from '../api';

const CANCELLABLE_STATUSES = ['pending', 'confirmed'];

function OrderList() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [cancelError, setCancelError] = useState(null);

  const loadOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchOrders();
      setOrders(data);
    } catch (err) {
      setError('Failed to load orders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleStatusChange = async (orderId, newStatus) => {
    await updateOrderStatus(orderId, newStatus);
    await loadOrders();
  };

  const handleCancel = async (order) => {
    const confirmed = window.confirm(
      `Cancel order #${order.id} for "${order.product_name}"?\n\nThis will restore ${order.quantity} unit(s) back to inventory.`
    );
    if (!confirmed) return;

    setCancelError(null);
    const result = await cancelOrder(order.id);
    if (result.error) {
      setCancelError(`Failed to cancel order #${order.id}: ${result.error}`);
    } else {
      await loadOrders();
    }
  };

  const sortedOrders = [...orders].sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];
    if (sortField === 'total_amount') {
      aVal = parseFloat(aVal);
      bVal = parseFloat(bVal);
    }
    if (sortDir === 'asc') return aVal > bVal ? 1 : -1;
    return aVal < bVal ? 1 : -1;
  });

  const handleSort = (field) => {
    if (field === sortField) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const statusOptions = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

  if (loading) {
    return <div className="order-list"><p style={{ color: '#999', padding: '2rem' }}>Loading orders…</p></div>;
  }

  if (error) {
    return (
      <div className="order-list">
        <p style={{ color: 'red', padding: '2rem' }}>{error}</p>
        <button className="submit-btn" onClick={loadOrders}>Retry</button>
      </div>
    );
  }

  return (
    <div className="order-list">
      <h2>Orders ({orders.length})</h2>

      {cancelError && (
        <div className="message error" style={{ marginBottom: '1rem' }}>
          {cancelError}
          <button
            onClick={() => setCancelError(null)}
            style={{ marginLeft: '1rem', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}

      <table className="order-table">
        <thead>
          <tr>
            <th onClick={() => handleSort('id')} style={{ cursor: 'pointer' }}>ID</th>
            <th>Customer</th>
            <th>Product</th>
            <th onClick={() => handleSort('quantity')} style={{ cursor: 'pointer' }}>Qty</th>
            <th onClick={() => handleSort('total_amount')} style={{ cursor: 'pointer' }}>Total</th>
            <th>Status</th>
            <th onClick={() => handleSort('created_at')} style={{ cursor: 'pointer' }}>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedOrders.map((order) => (
            <tr key={order.id}>
              <td>#{order.id}</td>
              <td>
                <div>{order.customer_name}</div>
                <small style={{ color: '#999' }}>{order.customer_email}</small>
              </td>
              <td>{order.product_name}</td>
              <td>{order.quantity}</td>
              <td>₹{parseFloat(order.total_amount).toLocaleString()}</td>
              <td>
                <select
                  className="status-select"
                  value={order.status}
                  onChange={(e) => handleStatusChange(order.id, e.target.value)}
                  disabled={order.status === 'cancelled'}
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </td>
              <td>{new Date(order.created_at).toLocaleDateString()}</td>
              <td>
                {CANCELLABLE_STATUSES.includes(order.status) && (
                  <button
                    onClick={() => handleCancel(order)}
                    style={{
                      background: '#e53e3e',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '0.3rem 0.7rem',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: '600',
                    }}
                  >
                    Cancel
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default OrderList;
