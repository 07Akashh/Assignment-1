function operationalError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.isOperational = true;
  return err;
}

module.exports = { operationalError };
