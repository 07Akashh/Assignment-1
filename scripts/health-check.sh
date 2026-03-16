#!/bin/bash
set -e

echo "Waiting for backend to be healthy..."
MAX_RETRIES=30
RETRY_COUNT=0

until curl --output /dev/null --silent --head --fail http://localhost:3001/api/health; do
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
      echo "Backend failed to come up in time."
      exit 1
    fi

    echo "Waiting... ($RETRY_COUNT/$MAX_RETRIES)"
    RETRY_COUNT=$((RETRY_COUNT+1))
    sleep 2
done

echo "Backend is up and running!"

echo "Verifying orders API..."
IF_ORDERS=$(curl --silent http://localhost:3001/api/orders)
if [[ $IF_ORDERS == *"error"* ]]; then
  echo "Orders API returned error!"
  exit 1
fi

echo "CI Health Check Passed Successfully!"
