import { useEffect } from 'react';

function CancelOrderDialog({ order, onConfirm, onAbort }) {
  useEffect(() => {
    if (!order) return;
    const handleKey = (e) => { if (e.key === 'Escape') onAbort(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [order, onAbort]);

  if (!order) return null;

  return (
    <div className="dialog-overlay" onClick={onAbort} aria-hidden="true">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-dialog-title"
        aria-describedby="cancel-dialog-desc"
        onClick={(e) => e.stopPropagation()}
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
          <button className="btn-secondary" onClick={onAbort}>Keep Order</button>
          <button className="btn-danger" onClick={() => onConfirm(order.id)}>Cancel Order</button>
        </div>
      </div>
    </div>
  );
}

export default CancelOrderDialog;
