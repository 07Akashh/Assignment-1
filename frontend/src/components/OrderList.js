import React, { useState, useEffect } from 'react';
import { fetchOrders, updateOrderStatus, cancelOrder } from '../api';

function OrderList() {
  const [orders, setOrders] = useState([]);
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadOrders = () => {
    setLoading(true);
    fetchOrders()
      .then(data => {
        setOrders(data);
        setError(null);
      })
      .catch(() => setError('Failed to load orders'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      const result = await updateOrderStatus(orderId, newStatus);
      if (result.error) {
        alert(result.error);
      }
      loadOrders();
    } catch {
      alert('Failed to update status');
    }
  };

  const handleCancel = async (orderId) => {
    if (!window.confirm('Are you sure you want to cancel this order? This will restore the product inventory.')) {
      return;
    }
    try {
      const result = await cancelOrder(orderId);
      if (result.error) {
        alert(result.error);
      } else {
        loadOrders();
      }
    } catch {
      alert('Failed to cancel order');
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
  const canCancel = (status) => ['pending', 'confirmed'].includes(status);

  if (loading) return <div className="order-list"><p>Loading orders...</p></div>;
  if (error) return <div className="order-list"><p style={{ color: 'red' }}>{error}</p></div>;

  return (
    <div className="order-list">
      <h2>Orders ({orders.length})</h2>
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
                  <span style={{ color: '#dc3545', fontWeight: 'bold' }}>Cancelled</span>
                ) : (
                  <select
                    className="status-select"
                    value={order.status}
                    onChange={(e) => handleStatusChange(order.id, e.target.value)}
                  >
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}
              </td>
              <td>{new Date(order.created_at).toLocaleDateString()}</td>
              <td>
                {canCancel(order.status) && (
                  <button
                    onClick={() => handleCancel(order.id)}
                    style={{
                      background: '#dc3545',
                      color: 'white',
                      border: 'none',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
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
