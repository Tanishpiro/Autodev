#!/usr/bin/env bash
# Simulates an external CRM (HubSpot/Salesforce style) sending a signed "deal won" webhook.
# Usage: WEBHOOK_SECRET=change-me-too ./demo-webhook.sh [http://localhost:4000]
URL=${1:-http://localhost:4000}; SECRET=${WEBHOOK_SECRET:-change-me-too}
BODY='{"event":"opportunity.updated","data":{"id":"HS-'$RANDOM'","title":"ERP Rollout","stage":"Won","value":75000,"type":"software","scope":"ERP rollout for 3 warehouses","customer":{"name":"Stark Logistics","email":"ops@stark.com"},"owner_email":"sales@demo.com"}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $NF}')
curl -s -XPOST "$URL/api/webhooks/crm" -H 'content-type: application/json' -H "x-signature: $SIG" -d "$BODY"; echo
