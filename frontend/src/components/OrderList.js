import React, { useState, useEffect } from "react";
import { fetchOrders, updateOrderStatus } from "../api";

function OrderList() {
  const [orders, setOrders] = useState([]);
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [isLoading, setisLoading] = useState(false);

  // BUG: No loading state, no error handling - shows blank screen if API fails
  useEffect(() => {
    console.log("api call");
    setisLoading(true);

    fetchOrders()
      .then((data) => {
        setOrders(data);
        setisLoading(false);
      })
      .catch((error) => {
        console.log(error);
        setisLoading(false);
      });
  }, [sortField, sortDir]);
  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus).then((data)=>{
        console.log(data)
      }).catch((erro)=>console.log(erro))
      // BUG: useEffect has missing dependency - this manual refetch is a workaround
      // but the stale closure over sortField/sortDir means sorting resets
      const data = await fetchOrders();
      setOrders(data)
    } catch (error) {
      console.log(error);
    }
  };

  let sortedOrders = [];
  if (orders.length != 0) {
    sortedOrders = [...orders].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (sortField === "total_amount") {
        aVal = parseFloat(aVal);
        bVal = parseFloat(bVal);
      }
      if (sortDir === "asc") return aVal > bVal ? 1 : -1;
      return aVal < bVal ? 1 : -1;
    });
  }

  const handleSort = (field) => {
    if (field === sortField) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const statusOptions = ["pending", "confirmed", "shipped", "delivered","cancelled"];

  return (
    <div className="order-list">
      <h2>Orders ({orders.length || 0})</h2>
      <table className="order-table">
        <thead>
          <tr>
            <th onClick={() => handleSort("id")} style={{ cursor: "pointer" }}>
              ID
            </th>
            <th>Customer</th>
            <th>Product</th>
            <th
              onClick={() => handleSort("quantity")}
              style={{ cursor: "pointer" }}
            >
              Qty
            </th>
            <th
              onClick={() => handleSort("total_amount")}
              style={{ cursor: "pointer" }}
            >
              Total
            </th>
            <th>Status</th>
            <th
              onClick={() => handleSort("created_at")}
              style={{ cursor: "pointer" }}
            >
              Date
            </th>
          </tr>
        </thead>
        <tbody>
          {/* BUG: Using array index as key on a sortable list */}
          {sortedOrders.length !== 0 &&
            sortedOrders.map((order, index) => (
              <tr key={order.id}>
                {/* used order id for unique value instead of index */}
                <td>#{order.id}</td>
                <td>
                  <div>{order.customer_name}</div>
                  <small style={{ color: "#999" }}>
                    {order.customer_email}
                  </small>
                </td>
                <td>{order.product_name}</td>
                <td>{order.quantity}</td>
                <td>₹{parseFloat(order.total_amount).toLocaleString()}</td>
                <td>
                  <select
                    className="status-select"
                    value={order.status}
                    onChange={(e) =>
                      handleStatusChange(order.id, e.target.value)
                    }
                  >
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{new Date(order.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export default OrderList;
