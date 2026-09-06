-- Keep existing articles and results; remove the custom delivery bookkeeping.
ALTER TABLE analyses
  DROP COLUMN lease_id,
  DROP COLUMN lease_until,
  DROP COLUMN attempt;
