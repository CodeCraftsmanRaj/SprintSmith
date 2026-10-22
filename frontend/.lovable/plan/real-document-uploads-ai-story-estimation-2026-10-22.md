# Real document uploads + AI story estimation

## 1. Document uploads feed the Docling tree (Ingest page)
- Turn on Lovable Cloud (database + file storage + sign-in).
- Uploading a file on the Ingest page stores it and creates a document record with status: Queued -> Parsing -> Ready (or Failed).
- The Docling tree lists the user's real documents with their live status badge, replacing the sample entries. Status refreshes automatically every few seconds while anything is still processing.
- Parsing step: a server job reads the file and builds a simple section tree (headings -> sections -> paragraphs/tables) for text, Markdown and PDF text; the tree expands to show those sections.
- The Sign in page becomes real (email + password) so each person sees their own documents.

## 2. AI story estimator (Plan & Sprint Backlog page)
- New "Estimate a story" panel: the project manager types a story title and description and clicks Estimate.
- AI returns: story points (Fibonacci 1-21), a confidence score, a short rationale, a risk note, and 3-6 acceptance criteria in Given/When/Then form.
- Result appears in the panel with "Add to backlog" which saves the story into the Product Backlog column (stored in the database, survives reloads).
- Clear error messages when AI credits run out or a request is refused.

## Technical details
- Tables: `documents` (owner, name, storage path, mime, status, error, tree jsonb), `backlog_stories` (owner, title, description, points, confidence, rationale, criteria jsonb). GRANTs + RLS scoped to `auth.uid()`.
- Private storage bucket `documents`, object policies by user folder.
- Server functions (`requireSupabaseAuth`): `registerUpload`, `processDocument` (download, parse, write tree/status), `listDocuments`, `estimateStory`, `saveStory`, `listStories`.
- Pages currently render static HTML strings; Ingest tree area and Plan estimator/backlog column are replaced by React components mounted into those regions, keeping the existing visual style.
- AI: Lovable AI Gateway, `openai/gpt-6-astra` via Responses API with streaming, strict JSON schema output, server-side only.
- Protected pages moved under the signed-in area; login wires to Cloud auth.
- Tests: points restricted to Fibonacci values; story ownership.

## Open question
If you meant an existing external backend (the API from your notes) instead of Lovable Cloud, share its base URL and endpoints and the upload part will call that instead.
