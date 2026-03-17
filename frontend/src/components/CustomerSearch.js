import React, { useState, useRef, useEffect } from 'react';
import { searchCustomers, createCustomer } from '../api';

function CustomerSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const debounceTimer = useRef(null);
  const currentSearch = useRef(0);

  useEffect(() => {
    return () => clearTimeout(debounceTimer.current);
  }, []);

  const handleSearch = (value) => {
    setQuery(value);
    setError(null);
    clearTimeout(debounceTimer.current);

    if (value.trim().length < 2) {
      setResults([]);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      const seq = ++currentSearch.current;
      setLoading(true);
      try {
        const data = await searchCustomers(value.trim());
        if (seq !== currentSearch.current) return; // discard stale response
        setResults(Array.isArray(data) ? data : []);
      } catch {
        if (seq !== currentSearch.current) return;
        setError('Search failed. Please try again.');
        setResults([]);
      } finally {
        if (seq === currentSearch.current) setLoading(false);
      }
    }, 300);
  };

  const handleAddCustomer = async () => {
    // BUG: No client-side validation either - sends empty strings to the
    // backend which also has no validation
    const result = await createCustomer({
      name: newName,
      email: newEmail,
      phone: newPhone,
    });

    if (result.error) {
      setMessage({ type: 'error', text: result.error });
    } else {
      setMessage({ type: 'success', text: `Customer "${result.name}" added!` });
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      setShowAdd(false);
      // Refresh search
      if (query) handleSearch(query);
    }
  };

  return (
    <div className="customer-search">
      <h2>Customer Search</h2>

      {message && (
        <div className={`message ${message.type}`}>{message.text}</div>
      )}

      <input
        className="search-input"
        type="text"
        placeholder="Search customers by name..."
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
      />

      <div style={{ marginBottom: '1rem' }}>
        <button
          className="submit-btn"
          style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}
          onClick={() => setShowAdd(!showAdd)}
        >
          {showAdd ? 'Cancel' : '+ Add Customer'}
        </button>
      </div>

      {showAdd && (
        <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>
          <div className="form-group">
            <label>Name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
          </div>
          <button className="submit-btn" onClick={handleAddCustomer}>Save Customer</button>
        </div>
      )}

      {loading && <p style={{ color: '#999' }}>Searching...</p>}
      {error && <p style={{ color: '#c00' }}>{error}</p>}

      {!loading && !error && results.length > 0 ? (
        results.map((customer) => (
          <div className="customer-card" key={customer.id}>
            <h3>{customer.name}</h3>
            <p>{customer.email} • {customer.phone}</p>
          </div>
        ))
      ) : (
        !loading && !error && query.trim().length >= 2 && results.length === 0 &&
          <p style={{ color: '#999' }}>No customers found.</p>
      )}
    </div>
  );
}

export default CustomerSearch;
