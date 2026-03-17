import { useState } from 'react';
import OrderList from './components/OrderList';
import CreateOrder from './components/CreateOrder';
import CustomerSearch from './components/CustomerSearch';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('orders');

  return (
    <div className="app">
      <header className="app-header">
        <h1>Order Management System</h1>
        <nav className="tab-nav">
          <button className={activeTab === 'orders'    ? 'active' : ''} onClick={() => setActiveTab('orders')}>Orders</button>
          <button className={activeTab === 'create'    ? 'active' : ''} onClick={() => setActiveTab('create')}>New Order</button>
          <button className={activeTab === 'customers' ? 'active' : ''} onClick={() => setActiveTab('customers')}>Customer Search</button>
        </nav>
      </header>
      <main className="app-content">
        {activeTab === 'orders'    && <OrderList />}
        {activeTab === 'create'    && <CreateOrder />}
        {activeTab === 'customers' && <CustomerSearch />}
      </main>
    </div>
  );
}

export default App;
