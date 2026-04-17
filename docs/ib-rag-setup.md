# IB Knowledge Base and RAG Setup

## What is already in the repo

- `lib/study-assistant.ts`
  Connects exam analysis to local IB knowledge context and material recommendations.
- `lib/ib-knowledge.ts`
  Defines the IB dictionary collections, starter discipline and subject seed data, and local retrieval helpers.
- `app/api/study/ib/*`
  Exposes subject lookup, knowledge-point lookup, and local retrieval APIs.
- `scripts/seed-ib-foundation.ts`
  Seeds starter IB disciplines, subjects, and command terms into the current app database.
- `scripts/import-ib-local-json.ts`
  Imports curated local JSON knowledge points and material chunks into the current app database.
- `scripts/bootstrap-ib-rag.mjs`
  Initializes the Zilliz Cloud Milvus collection after the required dependency is installed.
- `scripts/import-ib-materials.mjs`
  Imports real source materials into MongoDB metadata collections and Zilliz Cloud Milvus vectors after text extraction and embedding configuration are ready.

## Recommended rollout order

1. Run `npm run seed:ib-foundation`
2. Prepare `data/ib/knowledge-points.template.json` into your own curated knowledge-point JSON
3. Run `npm run import:ib-local-json -- data/ib/your-knowledge-points.json`
4. Add a few manually curated materials and chunks to the local app database if you want the local fallback retrieval to start working immediately
5. Configure `ZILLIZ_CLOUD_ADDRESS`, `ZILLIZ_CLOUD_TOKEN`, `STUDY_ASSISTANT_EMBEDDING_API_KEY`, and related variables
6. Install the missing infrastructure packages used by the optional scripts
7. Run `npm run ib:bootstrap-rag`
8. Prepare `data/ib/materials.template.json` into a real import manifest
9. Run `npm run ib:import-materials -- data/ib/your-materials.json`

## Optional packages for Zilliz import

The app can build without these packages because the integrations are loaded dynamically. Install them before running the Milvus/Zilliz or PDF import scripts:

```bash
npm install @zilliz/milvus2-sdk-node pdf-parse
```

## Minimum environment variables

```env
ZILLIZ_CLOUD_ADDRESS=
ZILLIZ_CLOUD_TOKEN=
ZILLIZ_COLLECTION_NAME=ib_material_embeddings
STUDY_ASSISTANT_API_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
STUDY_ASSISTANT_API_KEY=
STUDY_ASSISTANT_MODEL_ID=qwen-plus
STUDY_ASSISTANT_VISION_API_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
STUDY_ASSISTANT_VISION_MODEL_ID=qwen-plus
STUDY_ASSISTANT_EMBEDDING_API_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings
STUDY_ASSISTANT_EMBEDDING_API_KEY=
STUDY_ASSISTANT_EMBEDDING_MODEL=text-embedding-v4
STUDY_ASSISTANT_EMBEDDING_DIMENSIONS=1536
STUDY_ASSISTANT_RERANK_API_URL=https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank
STUDY_ASSISTANT_RERANK_API_KEY=
STUDY_ASSISTANT_RERANK_MODEL=qwen3-vl-rerank
```

`STUDY_ASSISTANT_EMBEDDING_API_KEY` and `STUDY_ASSISTANT_RERANK_API_KEY` can both use your DashScope API key. If they are omitted, the app falls back to `DASHSCOPE_API_KEY` or `ALIBABA_BAILIAN_API_KEY`.

## Upload parsing behavior

- `POST /api/study/exams` now supports direct parsing for uploaded study papers.
- Image uploads are sent to the configured DashScope-compatible vision model through `STUDY_ASSISTANT_VISION_MODEL_ID`.
- PDF uploads first try `pdf-parse`; if text is extracted successfully, the study assistant model structures it into questions and normalized raw text.
- This is enough to test the full flow of:
  1. user uploads paper
  2. system extracts text and question evidence
  3. `/api/study/exams/[id]/analyze` generates weak-point diagnosis, plan, and material recommendations
  4. `/api/study/check-ins` records execution and supervision feedback

## Current behavior before Zilliz is ready

- The study assistant still works.
- Subject matching uses the seeded IB subject dictionary.
- Material retrieval falls back to the current app database collections:
  - `ib_materials`
  - `ib_material_chunks`
  - `study_materials`
- This is enough to test the end-to-end flow with a small hand-built dataset.

## Storage split

- MongoDB stores structured metadata and text chunks:
  - `ib_disciplines`
  - `ib_subjects`
  - `ib_knowledge_points`
  - `ib_command_terms`
  - `ib_materials`
  - `ib_material_chunks`
- Zilliz Cloud Milvus stores vectors and filter fields:
  - `id`
  - `embedding`
  - `subject_id`
  - `subject_code`
  - `knowledge_point_ids`
  - `material_type`
  - `hl_sl`
  - `difficulty`
  - `chunk_token_count`
- MongoDB and Zilliz are joined by `ib_material_chunks.milvusVectorId` and Milvus `id`.

## Data import strategy

- Use official syllabus and markscheme data as the highest-priority sources.
- Start with one subject, not the full IB catalog.
- Import in this order:
  1. subject dictionary
  2. knowledge-point hierarchy
  3. command terms
  4. markschemes
  5. past-paper chunks
  6. knowledge notes

## Practical recommendation

Start with `MAA` or `Economics` first. They are easier to validate because weak-point diagnosis and resource recommendations are easier to inspect than open-ended essay subjects.

## Source ingestion notes

- `https://www.savemyexams.com/members/` appears to be a member-only source, so use an exported file, an authenticated HTML dump, or a manually downloaded archive rather than an unauthenticated crawler.
- `https://bestexamhelp.com/index.php` can be handled by a public crawler later, but keep rate limits conservative and store raw HTML before parsing.
- Local HTML past papers should be imported through a parser that first extracts question text, answer blocks, markscheme text, paper metadata, and topic hints into JSON, then passes that JSON to the same material import pipeline.
