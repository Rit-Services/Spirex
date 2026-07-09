# Document Import

## What was built

Local-extraction document import pipeline. No external LLM. Users upload a Markdown, plain text, PDF, or Word document; the server parses it into story drafts; the user reviews and edits them in a preview table before committing.

## Server

| File | Role |
|------|------|
| `server/prisma/migrations/20260424100000_phase10_document_import/migration.sql` | Adds `ImportStatus` enum, `DocumentImport` table, `Story.sourceDocumentId` FK, `ActivityEvent.imported` value |
| `server/services/ingest/textExtractor.ts` | Dispatches to `pdf-parse` (PDF), `mammoth` (DOCX), or UTF-8 passthrough (MD/TXT) |
| `server/services/ingest/sectionParser.ts` | Pure, deterministic section splitter: Markdown headings → setext underlines → numbered sections → double-newline paragraphs. Heuristic type (`story`/`bug`/`task`) and priority (`low`/`medium`/`high`/`critical`) classification per section |
| `server/services/ingest/importService.ts` | `createDraft` (extract + parse + persist), `getById`, `listByProject`, `commit` (calls `storyService.create` sequentially + links `sourceDocumentId`), `discard` |
| `server/controllers/import/importController.ts` | `createDraft`, `getImport`, `listByProject`, `commitImport`, `discardImport` |
| `server/routes/importRoutes.ts` | `POST /api/imports`, `GET /api/imports`, `GET /api/imports/:id`, `POST /api/imports/:id/commit`, `DELETE /api/imports/:id` |

## Client

| File | Role |
|------|------|
| `client/src/types/import.ts` | `DraftStory`, `CommitEdit`, `DocumentImport`, `ImportStatus` types |
| `client/src/apis/importApi.ts` | Axios wrappers for all 5 endpoints |
| `client/src/store/importSlice.ts` | Redux slice with `createDraftThunk`, `commitImportThunk`, `listImportsThunk`, `clearDraft` |
| `client/src/views/projects/ImportFromDoc.tsx` | Two-step UI: (1) drag-and-drop upload zone → (2) editable preview table with per-row type/priority selects and skip toggles |
| Route: `/projects/:id/import` | Registered in `client/src/routes/index.tsx` |

## Permissions

`import:create` added to both `server/utils/permissions.ts` and `client/src/features/auth/permissions.ts`.

Granted to: admin (global), lead/developer/reporter (project level).

## Fixture

`docs/example-import.md` — 3-section Markdown document used by E2E tests.

## E2E

`client/e2e/import.spec.ts` — 5 tests:
1. Upload area visible
2. Upload fixture MD → 3 draft cards appear
3. Commit 3 stories → redirect to backlog
4. Skip one story → commit count drops to 2
5. Cancel → redirect to backlog
6. Committed stories are searchable via global search

## Phase manifest

```json
{
  "phase": "10",
  "phase_name": "Document Import (local extraction)",
  "status": "complete",
  "built": [
    "DocumentImport Prisma model + migration",
    "ImportStatus enum",
    "ActivityEvent.imported enum value",
    "Story.sourceDocumentId FK",
    "server/services/ingest/textExtractor.ts",
    "server/services/ingest/sectionParser.ts",
    "server/services/ingest/importService.ts",
    "server/controllers/import/importController.ts",
    "server/routes/importRoutes.ts",
    "import:create permission (server + client mirror)",
    "client/src/types/import.ts",
    "client/src/apis/importApi.ts",
    "client/src/store/importSlice.ts",
    "client/src/views/projects/ImportFromDoc.tsx",
    "/projects/:id/import route",
    "docs/example-import.md fixture"
  ],
  "e2e_specs": ["client/e2e/import.spec.ts"],
  "test_command": "cd client && npm run test:e2e",
  "more_phases": false
}
```
