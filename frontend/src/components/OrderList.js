import { useState, useEffect, useCallback } from 'react';
import { fetchOrders, updateOrderStatus, cancelOrder } from '../api';
import CancelOrderDialog from './CancelOrderDialog';

const PAGE_LIMIT = parseInt(process.env.REACT_APP_PAGE_LIMIT || '50');

// Must stay in sync with ALLOWED_TRANSITIONS in backend/src/routes/orders.js.
// 'cancelled' is intentionally absent from every list — cancellation goes
// through the Cancel button which also restores inventory.
const ALLOWED_TRANSITIONS = {
  pending:   ['confirmed'],
  confirmed: ['shipped'],
  shipped:   ['delivered'],
  delivered: [],
  cancelled: [],
};

// Orders in these statuses are eligible for cancellation.
const CANCELLABLE_STATUSES = new Set(['pending', 'confirmed']);

function OrderList() {
  const [orders, setOrders]               = useState([]);
  const [total, setTotal]                 = useState(0);
  const [page, setPage]                   = useState(1);
  const [sortField, setSortField]         = useState('created_at');
  const [sortDir, setSortDir]             = useState('desc');
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);

  // Cancel flow state
  const [cancelDialogOrder, setCancelDialogOrder] = useState(null); // order shown in dialog
  const [cancellingId, setCancellingId]           = useState(null); // in-flight cancel request
  const [cancelError, setCancelError]             = useState(null); // { id, message }

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

  useEffect(() => {
    loadOrders(page);
  }, [page]); // loadOrders is stable within a page value; page change triggers reload via setPage

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus);
      loadOrders(page);
    } catch (err) {
      setError(err.message || 'Failed to update order status.');
    }
  };

  // Opens the confirmation dialog with the full order object
  const handleCancelClick = (order) => {
    setCancelError(null);
    setCancelDialogOrder(order);
  };

  // User confirmed in the dialog — call the dedicated cancel endpoint
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

  // User dismissed the dialog without confirming
  const handleCancelAbort = () => setCancelDialogOrder(null);

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
                {(() => {
                  const next = ALLOWED_TRANSITIONS[order.status] ?? [];
                  if (next.length === 0) {
                    return <span style={{ color: '#999' }}>{order.status}</span>;
                  }
                  return (
                    <select
                      className="status-select"
                      value={order.status}
                      onChange={(e) => handleStatusChange(order.id, e.target.value)}
                    >
                      <option value={order.status}>{order.status}</option>
                      {next.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  );
                })()}
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
          ))}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '1rem' }}>
          <button onClick={() => setPage(p => p - 1)} disabled={page === 1}>← Prev</button>
          <span>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>Next →</button>
        </div>
      )}

      {/* Rendered outside the table to avoid invalid DOM nesting */}
      <CancelOrderDialog
        order={cancelDialogOrder}
        onConfirm={handleCancelConfirm}
        onAbort={handleCancelAbort}
      />
    </div>
  );
}

export default OrderList;
