-- 007_request_review: a supervisor reviews every staff request before work starts (D47).
-- review_status is NULL for work orders created by the maintenance team. A staff request is
-- PENDING until a supervisor or admin approves it (and assigns it) or rejects it (CANCELLED).

ALTER TABLE work_orders ADD COLUMN review_status TEXT CHECK (
  review_status IS NULL OR (
    review_status IN ('PENDING', 'APPROVED', 'REJECTED')
    -- BR-R6: a request waiting for review is open and nobody is assigned yet.
    AND (review_status <> 'PENDING' OR (status = 'OPEN' AND assignee_id IS NULL))
    -- BR-R8: a rejected request is cancelled.
    AND (review_status <> 'REJECTED' OR status = 'CANCELLED')
  )
);
ALTER TABLE work_orders ADD COLUMN reviewed_by INTEGER REFERENCES users (id);
ALTER TABLE work_orders ADD COLUMN reviewed_at TEXT;
-- Why the request was rejected, shown to the requester.
ALTER TABLE work_orders ADD COLUMN review_note TEXT;

-- The dashboard counts the requests to review.
CREATE INDEX work_orders_to_review_idx ON work_orders (review_status) WHERE review_status = 'PENDING';

-- Requests sent before this migration: still open and unassigned → to review; cancelled →
-- rejected; the others were already taken in hand by the maintenance team.
UPDATE work_orders
SET review_status = CASE
    WHEN status = 'OPEN' AND assignee_id IS NULL THEN 'PENDING'
    WHEN status = 'CANCELLED' THEN 'REJECTED'
    ELSE 'APPROVED'
  END
WHERE created_by IN (SELECT id FROM users WHERE role = 'STAFF');
