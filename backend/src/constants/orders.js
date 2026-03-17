const VALID_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

const ALLOWED_TRANSITIONS = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['shipped',   'cancelled'],
  shipped:   ['delivered'],
  delivered: [],
  cancelled: [],
};

const ALLOWED_TRANSITIONS_REVERSE = Object.entries(ALLOWED_TRANSITIONS).reduce(
  (acc, [from, tos]) => {
    tos.forEach(to => { (acc[to] = acc[to] || []).push(from); });
    return acc;
  },
  {}
);

const CANCELLABLE_STATUSES = ['pending', 'confirmed'];

module.exports = { VALID_STATUSES, ALLOWED_TRANSITIONS, ALLOWED_TRANSITIONS_REVERSE, CANCELLABLE_STATUSES };
