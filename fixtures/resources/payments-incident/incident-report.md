# Incident: payments-gateway duplicate captures

All data in this directory is fictional demo fixture content for the
ScopedRun Resource Capsule demo. It is not real customer data. In the demo
this Resource is entitled to user-b only; user-a requesting it must be
denied before the Runtime starts.

- Incident ID: INC-2026-0825-PAYMENTS
- Window: 2026-08-25 14:05 UTC to 2026-08-25 15:20 UTC
- Impact: 42 fictional payments captured twice
- Suspected cause: retry storm after an upstream acquirer timeout

## Summary

A 90-second upstream acquirer outage at 14:05 caused capture requests to
time out after the money had actually moved. The gateway retried those
captures without an idempotency key, producing duplicate captures until the
retry queue drained at 15:20. All 42 duplicates were refunded the same day.
