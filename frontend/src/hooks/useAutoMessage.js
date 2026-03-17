import { useState, useEffect, useRef } from 'react';

/**
 * Like useState for a { type, text } message, but the message auto-clears
 * after a delay. Success messages clear after 4 s; errors after 6 s so the
 * user has enough time to read and act.
 *
 * Usage (drop-in for `const [message, setMessage] = useState(null)`):
 *   const [message, setMessage] = useAutoMessage();
 */
export function useAutoMessage() {
  const [message, setMessageRaw] = useState(null);
  const timerRef = useRef(null);

  const setMessage = (msg) => {
    clearTimeout(timerRef.current);
    setMessageRaw(msg);
    if (msg) {
      const delay = msg.type === 'error' ? 6000 : 4000;
      timerRef.current = setTimeout(() => setMessageRaw(null), delay);
    }
  };

  // Cancel any pending timer on unmount
  useEffect(() => () => clearTimeout(timerRef.current), []);

  return [message, setMessage];
}
