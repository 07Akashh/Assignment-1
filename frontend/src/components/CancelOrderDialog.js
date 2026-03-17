import { useEffect } from 'react';

/**
 * Modal confirmation dialog for order cancellation.
 *
 * Props:
 *   order    — the full order object to display, or null when hidden
 *   onConfirm(orderId) — called when the user clicks "Cancel Order"
 *   onAbort  — called when the user dismisses without confirming
 */
function CancelOrderDialog({ order, onConfirm, onAbort }) {
  // Close on Escape key
  useEffect(() => {
    if (!order) return;
    const handleKey = (e) => { if (e.key === 'Escape') onAbort(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [order, onAbort]);

  if (!order) return null;

  return (
    // Backdrop — click outside to dismiss
    <div className="dialog-overlay" onClick={onAbort} aria-hidden="true">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-dialog-title"
        aria-describedby="cancel-dialog-desc"
        onClick={(e) => e.stopPropagation()} // prevent backdrop click from bubbling
      >
        <h3 id="cancel-dialog-title" className="dialog-title">
          Cancel Order #{order.id}?
        </h3>

        <div id="cancel-dialog-desc" className="dialog-body">
          <div className="dialog-order-detail">
            <span className="dialog-label">Customer</span>
            <span>{order.customer_name}</span>
          </div>
          <div className="dialog-order-detail">
            <span className="dialog-label">Product</span>
            <span>{order.product_name}</span>
          </div>
          <div className="dialog-order-detail">
            <span className="dialog-label">Quantity</span>
            <span>{order.quantity}</span>
          </div>
          <div className="dialog-order-detail">
            <span className="dialog-label">Total</span>
            <span>₹{parseFloat(order.total_amount).toLocaleString()}</span>
          </div>

          <p className="dialog-warning">
            This cannot be undone. {order.quantity} unit{order.quantity !== 1 ? 's' : ''} of{' '}
            <strong>{order.product_name}</strong> will be returned to inventory.
          </p>
        </div>

        <div className="dialog-actions">
          <button className="btn-secondary" onClick={onAbort}>
            Keep Order
          </button>
          <button className="btn-danger" onClick={() => onConfirm(order.id)}>
            Cancel Order
          </button>
        </div>
      </div>
    </div>
  );
}

export default CancelOrderDialog;
