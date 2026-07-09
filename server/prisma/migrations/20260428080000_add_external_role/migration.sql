-- AlterEnum: add 'external' value to GlobalRole.
-- External / client users cannot create projects and cannot import from JIRA;
-- their finer-grained access comes from project membership.
ALTER TYPE "GlobalRole" ADD VALUE 'external';
