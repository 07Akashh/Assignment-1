import { useState, useRef, useEffect } from 'react';
import { searchCustomers, createCustomer } from '../api';
import FlashMessage from './FlashMessage';

const EMAIL_RE      = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_SEARCH_RE = /^[a-zA-Z\u00C0-\u024F\s'\-.]+$/;
const PHONE_DIGITS_RE = /\d/g;

function validateCustomer({ name, email, phone }) {
  const errors = {};
  if (!name.trim())               errors.name  = 'Name is required.';
  if (!email.trim())              errors.email = 'Email is required.';
  else if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
  if (phone.trim()) {
    const digits = (phone.match(PHONE_DIGITS_RE) || []).length;
    if (!/^[0-9\s+\-()\\.]+$/.test(phone)) errors.phone = 'Phone contains invalid characters.';
    else if (digits < 7)                   errors.phone = 'Phone number is too short (min 7 digits).';
    else if (digits > 15)                  errors.phone = 'Phone number is too long (max 15 digits).';
  }
  return errors;
}

function CustomerSearch() {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [showAdd, setShowAdd]   = useState(false);
  const [newName, setNewName]   = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [message, setMessage]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [submitting, setSubmitting]   = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const debounceTimer = useRef(null);
  const searchSeq     = useRef(0);

  useEffect(() => () => clearTimeout(debounceTimer.current), []);

  const clearFieldError = (field) => setFieldErrors(fe => ({ ...fe, [field]: undefined }));

  const handleSearch = (value) => {
    setQuery(value);
    setError(null);
    clearTimeout(debounceTimer.current);

    if (value.trim().length < 2) { setResults([]); return; }

    if (!NAME_SEARCH_RE.test(value.trim())) {
      setError('Search can only contain letters, spaces, hyphens, apostrophes, or periods.');
      setResults([]);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      const seq = ++searchSeq.current;
      setLoading(true);
      try {
        const data = await searchCustomers(value.trim());
        if (seq !== searchSeq.current) return;
        setResults(Array.isArray(data) ? data : []);
      } catch {
        if (seq !== searchSeq.current) return;
        setError('Search failed. Please try again.');
        setResults([]);
      } finally {
        if (seq === searchSeq.current) setLoading(false);
      }
    }, 300);
  };

  const handleAddCustomer = async () => {
    const errors = validateCustomer({ name: newName, email: newEmail, phone: newPhone });
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }

    setFieldErrors({});
    setMessage(null);
    setSubmitting(true);
    try {
      const result = await createCustomer({ name: newName, email: newEmail, phone: newPhone });
      setMessage({ type: 'success', text: `Customer "${result.name}" added!` });
      setNewName(''); setNewEmail(''); setNewPhone('');
      setShowAdd(false);
      if (query) handleSearch(query);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to save customer.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleAdd = () => {
    setShowAdd(v => !v);
    setFieldErrors({});
    setMessage(null);
  };

  return (
    <div className="customer-search">
      <h2>Customer Search</h2>

      {message && <FlashMessage message={message} onDismiss={() => setMessage(null)} />}

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
          onClick={handleToggleAdd}
        >
          {showAdd ? 'Cancel' : '+ Add Customer'}
        </button>
      </div>

      {showAdd && (
        <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>
          <div className="form-group">
            <label>Name</label>
            <input
              value={newName}
              onChange={(e) => { setNewName(e.target.value); clearFieldError('name'); }}
              style={fieldErrors.name ? { borderColor: '#c0392b' } : undefined}
            />
            {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => { setNewEmail(e.target.value); clearFieldError('email'); }}
              style={fieldErrors.email ? { borderColor: '#c0392b' } : undefined}
            />
            {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
          </div>
          <div className="form-group">
            <label>Phone <span style={{ color: '#999', fontWeight: 400 }}>(optional)</span></label>
            <input
              value={newPhone}
              onChange={(e) => { setNewPhone(e.target.value); clearFieldError('phone'); }}
              style={fieldErrors.phone ? { borderColor: '#c0392b' } : undefined}
            />
            {fieldErrors.phone && <p className="field-error">{fieldErrors.phone}</p>}
          </div>
          <button className="submit-btn" onClick={handleAddCustomer} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save Customer'}
          </button>
        </div>
      )}

      {loading && <p style={{ color: '#999' }}>Searching...</p>}
      {error   && <p style={{ color: '#c00' }}>{error}</p>}

      {!loading && !error && results.length > 0 && results.map((customer) => (
        <div className="customer-card" key={customer.id}>
          <h3>{customer.name}</h3>
          <p>{customer.email} • {customer.phone}</p>
        </div>
      ))}

      {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
        <p style={{ color: '#999' }}>No customers found.</p>
      )}
    </div>
  );
}

export default CustomerSearch;
