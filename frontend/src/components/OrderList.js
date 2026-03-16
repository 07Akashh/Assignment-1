import React, { useState, useEffect } from 'react';
import { fetchOrders, updateOrderStatus, cancelOrder } from '../api';

function OrderList() {
  const [orders, setOrders] = useState([]);
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [actionOrderId, setActionOrderId] = useState(null);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOrders();
      if (data.error) {
        setError(data.error);
        setOrders([]);
      } else {
        setOrders(data);
      }
    } catch (err) {
      setError('Failed to load orders');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleStatusChange = async (orderId, newStatus) => {
    setMessage(null);
    setActionOrderId(orderId);
    try {
      const result = await updateOrderStatus(orderId, newStatus);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: `Order #${orderId} updated` });
        await loadOrders();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to update order status' });
    } finally {
      setActionOrderId(null);
    }
  };

  const handleCancel = async (orderId) => {
    const confirmed = window.confirm(`Cancel order #${orderId}? This will restore inventory.`);
    if (!confirmed) return;

    setMessage(null);
    setActionOrderId(orderId);
    try {
      const result = await cancelOrder(orderId);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: `Order #${orderId} cancelled` });
        await loadOrders();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to cancel order' });
    } finally {
      setActionOrderId(null);
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

  const statusOptions = ['pending', 'confirmed', 'shipped', 'delivered'];
  const cancellableStatuses = ['pending', 'confirmed'];

  return (
    <div className="order-list">
      <h2>Orders ({orders.length})</h2>
      {loading && <p className="muted">Loading orders...</p>}
      {error && <div className="message error">{error}</div>}
      {message && <div className={`message ${message.type}`}>{message.text}</div>}
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
                {order.status === 'cancelled' ? (
                  <span className="status-badge status-cancelled">cancelled</span>
                ) : (
                  <select
                    className="status-select"
                    value={order.status}
                    onChange={(e) => handleStatusChange(order.id, e.target.value)}
                    disabled={actionOrderId === order.id}
                  >
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}
              </td>
              <td>{new Date(order.created_at).toLocaleDateString()}</td>
              <td>
                {cancellableStatuses.includes(order.status) ? (
                  <button
                    className="cancel-btn"
                    onClick={() => handleCancel(order.id)}
                    disabled={actionOrderId === order.id}
                  >
                    {actionOrderId === order.id ? 'Working...' : 'Cancel'}
                  </button>
                ) : (
                  <span className="muted">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && !error && sortedOrders.length === 0 && (
        <p className="muted">No orders found.</p>
      )}
    </div>
  );
}

export default OrderList;
