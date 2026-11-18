# Planned database tables (documentation only — not implemented yet)

PostgreSQL is the source of truth. Google Sheets is a secondary sync target for
leave requests and daily updates. No migrations are generated yet; this file is
the working plan for when schemas are finalized.

## employees
Pre-provisioned employees and admins. Accounts must exist here **before** a
Google Workspace login succeeds.

| column        | type        | notes                                                  |
| ------------- | ----------- | ------------------------------------------------------ |
| id            | uuid (pk)   |                                                        |
| email         | text unique | Company Workspace email, used to match the Google user |
| full_name     | text        |                                                        |
| role          | enum        | `admin` \| `employee`                                  |
| is_active     | boolean     | inactive employees cannot log in                       |
| google_sub    | text unique, nullable | Google `sub` claim after first verified login |
| job_title     | text, nullable | shown on profile                                     |
| manager_email | text, nullable | notification recipient for this employee             |
| created_at    | timestamptz |                                                        |
| updated_at    | timestamptz |                                                        |

## sessions
Application-owned, revocable sessions backing HttpOnly cookies. Not Google
tokens; the app issues its own opaque session id after OIDC verification.

| column        | type        | notes                                              |
| ------------- | ----------- | -------------------------------------------------- |
| id            | uuid (pk)   | opaque cookie value references this (hashed or id) |
| employee_id   | uuid fk -> employees.id |                                         |
| created_at    | timestamptz |                                                    |
| expires_at    | timestamptz | absolute expiry                                    |
| revoked_at    | timestamptz, nullable | revocation support                       |
| user_agent    | text, nullable | audit metadata only                              |
| ip_address    | inet, nullable  | audit metadata only                             |

## attendance
Daily check-in / check-out events, independent from application login/logout.

| column      | type        | notes                                          |
| ----------- | ----------- | ---------------------------------------------- |
| id          | uuid (pk)   |                                                |
| employee_id | uuid fk -> employees.id |                                    |
| work_date   | date        | one row per employee per day (unique together) |
| checked_in_at | timestamptz |                                              |
| checked_out_at | timestamptz, nullable |                                    |
| created_at / updated_at | timestamptz |                                     |
| UNIQUE(employee_id, work_date) |                                            |

## leave_requests
Employee-submitted time-off requests. Mirrored to Google Sheets via the
integration job queue. Approval state / balances are OUT of MVP scope.

| column      | type        | notes                                           |
| ----------- | ----------- | ----------------------------------------------- |
| id          | uuid (pk)   |                                                 |
| employee_id | uuid fk -> employees.id | record-ownership checks key on this  |
| start_date  | date        |                                                 |
| end_date    | date        |                                                 |
| reason      | text        |                                                 |
| created_at  | timestamptz |                                                 |

## daily_updates
One work update per employee per day. Also mirrored to Google Sheets.

| column      | type        | notes                                     |
| ----------- | ----------- | ----------------------------------------- |
| id          | uuid (pk)   |                                           |
| employee_id | uuid fk -> employees.id |                               |
| work_date   | date        |                                           |
| content     | text        |                                           |
| created_at / updated_at | timestamptz |                               |
| UNIQUE(employee_id, work_date) |                                        |

## holidays
Company-wide holidays. Admin-managed; visible to everyone.

| column      | type        | notes                 |
| ----------- | ----------- | --------------------- |
| id          | uuid (pk)   |                       |
| name        | text        |                       |
| date        | date unique | no overlapping entries|
| created_at / updated_at | timestamptz |           |

## integration_jobs
Durable job queue for outbound integrations (manager emails after attendance
events, Sheets sync for leave requests / daily updates). Rows survive restarts
and carry retry state.

| column         | type        | notes                                            |
| -------------- | ----------- | ------------------------------------------------ |
| id             | uuid (pk)   |                                                  |
| kind           | enum        | `email_manager_notification` \| `sheets_sync`    |
| status         | enum        | `pending` \| `in_progress` \| `done` \| `failed` |
| payload        | jsonb       | target row data (no secrets)                     |
| attempts       | integer     | retry counter                                    |
| max_attempts   | integer     |                                                  |
| run_after      | timestamptz | backoff scheduling                               |
| last_error     | text, nullable | truncated message only, no secrets            |
| created_at / updated_at | timestamptz |                                        |

Notes:
- Employees and profiles are one table for now; separate profile tables can be
  added later if needed.
- Sessions are application-owned and revocable; they never store Google tokens
  in this plan.
