import React, { useState, useEffect } from 'react';
import { fetchOrders, updateOrderStatus, cancelOrder } from '../api';

function OrderList() {
  const [orders, setOrders] = useState([]);
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchOrders()
      .then(data => setOrders(Array.isArray(data) ? data : []))
      .catch(() => setOrders([]));
  }, []);

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus);
      const data = await fetchOrders();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to update status' });
    }
  };

  const handleCancelClick = (order) => {
    const ok = window.confirm(
      `Cancel order #${order.id} (${order.product_name}, qty ${order.quantity})? Inventory will be restored.`
    );
    if (!ok) return;
    setMessage(null);
    cancelOrder(order.id)
      .then(async () => {
        const data = await fetchOrders();
        setOrders(Array.isArray(data) ? data : []);
        setMessage({ type: 'success', text: 'Order cancelled. Inventory restored.' });
      })
      .catch((err) => {
        setMessage({ type: 'error', text: err.message || 'Failed to cancel order' });
      });
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
  const canCancel = (status) => status === 'pending' || status === 'confirmed';

  return (
    <div className="order-list">
      <h2>Orders ({orders.length})</h2>
      {message && (
        <div className={`message ${message.type}`} style={{ marginBottom: '1rem' }}>
          {message.text}
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
            <th>Action</th>
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
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </td>
              <td>{new Date(order.created_at).toLocaleDateString()}</td>
              <td>
                {canCancel(order.status) && (
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => handleCancelClick(order)}
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
