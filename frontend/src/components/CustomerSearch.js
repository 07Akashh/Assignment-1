import React, { useState, useEffect } from 'react';
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

  // Optimized: Debounced search effect
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (query.trim()) {
        try {
          setLoading(true);
          setError(null);
          const data = await searchCustomers(query);
          if (data.error) throw new Error(data.error);
          setResults(data);
        } catch (err) {
          setError('Search failed');
          setResults([]);
        } finally {
          setLoading(false);
        }
      } else {
        setResults([]);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  const handleAddCustomer = async () => {
    if (!newName || !newEmail) {
      setMessage({ type: 'error', text: 'Name and email are required' });
      return;
    }

    if (!newEmail.includes('@')) {
      setMessage({ type: 'error', text: 'Please enter a valid email' });
      return;
    }

    try {
      setLoading(true);
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
        // Search will automatically re-run due to the effect if query matches
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to add customer' });
    } finally {
      setLoading(false);
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
        onChange={(e) => setQuery(e.target.value)}
      />

      {loading && <div style={{ marginBottom: '1rem', color: '#666' }}>Searching...</div>}
      {error && <div className="message error">{error}</div>}

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

      {results.length > 0 ? (
        results.map((customer) => (
          <div className="customer-card" key={customer.id}>
            <h3>{customer.name}</h3>
            <p>{customer.email} • {customer.phone}</p>
          </div>
        ))
      ) : (
        query.length > 0 && !loading && <p style={{ color: '#999' }}>No customers found.</p>
      )}
    </div>
  );
}

export default CustomerSearch;
