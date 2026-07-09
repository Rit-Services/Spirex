-- Kanban WIP limits on workflow columns.
--
-- Hand-written to match the repo convention (idempotent guards): the statement
-- is a NO-OP on a database that already has the column and ADDS it on one that
-- doesn't, so `prisma migrate deploy` applies it safely in every environment
-- (local dev and prod K8s alike). Purely ADDITIVE — nullable column, no data
-- rewrite, no drops. `wipLimit` NULL means "no limit" (the default for every
-- existing row).

ALTER TABLE "WorkflowStatus" ADD COLUMN IF NOT EXISTS "wipLimit" INTEGER;
