import { useState, useEffect, useCallback } from 'react';
import { fetchOrders, updateOrderStatus, cancelOrder } from '../api';
import CancelOrderDialog from './CancelOrderDialog';
import { ALLOWED_TRANSITIONS, CANCELLABLE_STATUSES } from '../constants/orders';

const PAGE_LIMIT = parseInt(process.env.REACT_APP_PAGE_LIMIT || '50');

function OrderList() {
  const [orders, setOrders]   = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir]     = useState('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const [cancelDialogOrder, setCancelDialogOrder] = useState(null);
  const [cancellingId, setCancellingId]           = useState(null);
  const [cancelError, setCancelError]             = useState(null);

  const loadOrders = useCallback(async (p = page) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchOrders({ page: p, limit: PAGE_LIMIT });
      setOrders(Array.isArray(res.data) ? res.data : []);
      setTotal(res.total || 0);
    } catch (err) {
      setError(err.message || 'Failed to load orders. Please try again.');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { loadOrders(page); }, [page]); // eslint-disable-line

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus);
      loadOrders(page);
    } catch (err) {
      setError(err.message || 'Failed to update order status.');
    }
  };

  const handleCancelClick   = (order) => { setCancelError(null); setCancelDialogOrder(order); };
  const handleCancelAbort   = ()      => setCancelDialogOrder(null);

  const handleCancelConfirm = async (orderId) => {
    setCancelDialogOrder(null);
    setCancellingId(orderId);
    setCancelError(null);
    try {
      await cancelOrder(orderId);
      loadOrders(page);
    } catch (err) {
      setCancelError({ id: orderId, message: err.message || 'Failed to cancel order.' });
    } finally {
      setCancellingId(null);
    }
  };

  const sortedOrders = [...orders].sort((a, b) => {
    let aVal = sortField === 'total_amount' ? parseFloat(a[sortField]) : a[sortField];
    let bVal = sortField === 'total_amount' ? parseFloat(b[sortField]) : b[sortField];
    return sortDir === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
  });

  const handleSort = (field) => {
    if (field === sortField) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const totalPages = Math.ceil(total / PAGE_LIMIT);

  if (loading) return <div className="order-list"><p style={{ color: '#999' }}>Loading orders...</p></div>;
  if (error)   return <div className="order-list"><p style={{ color: '#c00' }}>{error} <button onClick={() => loadOrders(page)}>Retry</button></p></div>;

  return (
    <div className="order-list">
      <h2>Orders ({total})</h2>

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
          {sortedOrders.map((order) => {
            const nextStatuses = ALLOWED_TRANSITIONS[order.status] ?? [];
            return (
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
                  {nextStatuses.length === 0 ? (
                    <span style={{ color: '#999' }}>{order.status}</span>
                  ) : (
                    <select
                      className="status-select"
                      value={order.status}
                      onChange={(e) => handleStatusChange(order.id, e.target.value)}
                    >
                      <option value={order.status}>{order.status}</option>
                      {nextStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </td>
                <td>{new Date(order.created_at).toLocaleDateString()}</td>
                <td>
                  {cancellingId === order.id ? (
                    <small style={{ color: '#999' }}>Cancelling…</small>
                  ) : (
                    <>
                      {CANCELLABLE_STATUSES.has(order.status) && (
                        <button
                          className="btn-cancel-order"
                          onClick={() => handleCancelClick(order)}
                          disabled={cancellingId !== null}
                        >
                          Cancel
                        </button>
                      )}
                      {cancelError?.id === order.id && (
                        <div style={{ color: '#c00', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                          {cancelError.message}
                        </div>
                      )}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '1rem' }}>
          <button onClick={() => setPage(p => p - 1)} disabled={page === 1}>← Prev</button>
          <span>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>Next →</button>
        </div>
      )}

      <CancelOrderDialog
        order={cancelDialogOrder}
        onConfirm={handleCancelConfirm}
        onAbort={handleCancelAbort}
      />
    </div>
  );
}

export default OrderList;
