// Mirrors the backend state machine — keep in sync with backend/src/constants/orders.js.
// 'cancelled' is absent from transition lists: cancellation goes through the
// dedicated Cancel button which also restores inventory.
export const ALLOWED_TRANSITIONS = {
  pending:   ['confirmed'],
  confirmed: ['shipped'],
  shipped:   ['delivered'],
  delivered: [],
  cancelled: [],
};

export const CANCELLABLE_STATUSES = new Set(['pending', 'confirmed']);
