import React, { useState, useEffect, useCallback } from 'react';
import { fetchOrders, updateOrderStatus, cancelOrder } from '../api';

function OrderList() {
  const [orders, setOrders] = useState([]);
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const limit = 10; // Items per page

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchOrders(limit, page * limit);
      if (data.error) throw new Error(data.error);
      setOrders(data);
      setError(null);
    } catch (err) {
      setError(
        "Failed to fetch orders. Please check if the backend is running.",
      );
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, limit]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      const result = await updateOrderStatus(orderId, newStatus);
      if (result.error) throw new Error(result.error);
      await loadOrders();
    } catch (err) {
      alert(err.message || "Failed to update status");
    }
  };

  const handleCancel = async (orderId) => {
    if (window.confirm('Are you sure you want to cancel this order?')) {
      try {
        const result = await cancelOrder(orderId);
        if (result.error) throw new Error(result.error);
        await loadOrders();
      } catch (err) {
        alert(err.message || 'Failed to cancel order');
      }
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

  if (loading) return <div className="loader">Loading orders...</div>;
  if (error) return <div className="message error">{error}</div>;

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
                <span className={`status-badge ${order.status}`}>
                  {order.status}
                </span>
                {order.status !== 'cancelled' &&
                  order.status !== 'delivered' && (
                    <select
                      className="status-select"
                      value={order.status}
                      onChange={(e) =>
                        handleStatusChange(order.id, e.target.value)
                      }
                      style={{ marginLeft: '10px' }}
                    >
                      <option value={order.status} disabled>
                        Move to...
                      </option>
                      {statusOptions
                        .slice(statusOptions.indexOf(order.status) + 1)
                        .map((s) => (
                          <option key={s} value={s}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </option>
                        ))}
                    </select>
                  )}
              </td>
              <td>{new Date(order.created_at).toLocaleDateString()}</td>
              <td>
                {(order.status === 'pending' ||
                  order.status === 'confirmed') && (
                  <button
                    onClick={() => handleCancel(order.id)}
                    className="cancel-btn"
                  >
                    Cancel
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pagination">
        <button 
          disabled={page === 0} 
          onClick={() => setPage(p => p - 1)}
          className="pagination-btn"
        >
          Previous
        </button>
        <span className="page-info">Page {page + 1}</span>
        <button 
          disabled={orders.length < limit} 
          onClick={() => setPage(p => p + 1)}
          className="pagination-btn"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default OrderList;
