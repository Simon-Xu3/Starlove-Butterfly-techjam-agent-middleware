# Timeline (all times UTC, fictional demo data)

| Time  | Event |
| ----- | ----- |
| 21:38 | orders-service v2.14.0 deployed with DB_POOL_SIZE=5 |
| 21:40 | first checkout timeouts observed |
| 21:44 | alert ORDERS-5XX-RATE fired |
| 21:52 | on-call engineer paged |
| 22:05 | root cause identified: mistyped pool size |
| 22:11 | rollback to v2.13.2 started |
| 22:15 | error rate recovered |
