import { useState, useCallback } from 'react';

function FlashMessage({ message, onDismiss }) {
  const [leaving, setLeaving] = useState(false);

  const handleDismiss = useCallback(() => {
    setLeaving(true);
    setTimeout(onDismiss, 250);
  }, [onDismiss]);

  return (
    <div
      className={`flash flash--${message.type}${leaving ? ' flash--leaving' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="flash__text">{message.text}</span>
      <button className="flash__close" onClick={handleDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

export default FlashMessage;
