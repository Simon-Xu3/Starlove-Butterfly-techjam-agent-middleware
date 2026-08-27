# Incident: orders-service checkout failures

All data in this directory is fictional demo fixture content for the
ScopedRun Resource Capsule demo. It is not real customer data.

- Incident ID: INC-2026-0826-ORDERS
- Window: 2026-08-26 21:40 UTC to 2026-08-26 22:15 UTC
- Impact: 18% of checkout requests returned HTTP 500
- Suspected cause: connection pool exhaustion after the 21:38 deploy

## Summary

The 21:38 deploy of orders-service v2.14.0 reduced the database connection
pool from 50 to 5 connections due to a mistyped environment variable
(DB_POOL_SIZE=5 instead of 50). Under evening peak traffic the pool
saturated within two minutes and checkout requests began timing out.

Rolling back to v2.13.2 at 22:11 restored normal error rates by 22:15.
