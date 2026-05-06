# IB Past Paper Import

## Overview

The importer is now source-agnostic. It can scan a root folder such as `D:\wendang\IB`, discover year/session folders or archives, build paper/markscheme manifests, extract only the selected files, and optionally import chunks into MongoDB + Zilliz using Qwen `text-embedding-v4`.

The safe default is dry run: commands generate manifests and copy/extract PDFs, but do not call embeddings and do not write MongoDB or Zilliz unless `--import` is added.

## Step 1: Scan The Root Folder

Run this whenever you add new yearly folders or archives:

```bash
npm run ib:scan-archives -- --root "D:\wendang\IB" --out data/ib/archive-manifests/archive-scan.json
```

Output:

```text
data/ib/archive-manifests/archive-scan.json
```

Each source gets a unique `slug`, for example `may2015`, `may2015-2`, `nov2017`, or `session2001-2`. Use the slug with `--sources`.

## Step 2: Dry Run One Source

Use this before any real import. It validates pairing and extraction for one source:

```bash
npm run ib:import-archive-root -- --scan data/ib/archive-manifests/archive-scan.json --sources may2015 --all-subjects --limit-per-archive 1
```

Expected behavior:

```text
Manifest written to ...
extractedFiles: 2
materials: 2
Dry run completed. Add --import to write materials to MongoDB and Zilliz.
```

The default batch importer requires a matched markscheme. If an older folder has `pairsWithMarkscheme: 0`, dry run may produce `materials: 0`; that is expected and prevents importing unpaired papers accidentally.

## Step 3: Import A Small Real Batch

After dry run looks correct, add `--import`. This writes MongoDB records, generates Qwen embeddings, and upserts vectors into Zilliz.

```bash
npm run ib:import-archive-root -- --scan data/ib/archive-manifests/archive-scan.json --sources may2015 --all-subjects --limit-per-archive 2 --import
```

Use this to verify end-to-end RAG after import:

```bash
npm run ib:smoke-test-rag
```

For a more useful quality check, run targeted retrieval tests and inspect the returned titles/snippets:

```bash
npm run ib:evaluate-rag -- --subject Mathematics --query "IB Mathematics calculus derivative Paper 1 markscheme" --types MARK_SCHEME --limit 5

npm run ib:evaluate-rag -- --subject Physics --query "IB Physics mechanics forces Paper 2 markscheme" --types MARK_SCHEME --limit 5

npm run ib:evaluate-rag -- --subject Chemistry --query "IB Chemistry stoichiometry mole calculations Paper 1" --limit 5
```

Good retrieval usually means the top results match the requested subject, the material type is appropriate, and the snippet contains relevant paper or markscheme content rather than random neighboring text.

## Import Specific Subjects

For your first real batches, this is the recommended path:

```bash
npm run ib:import-archive-root -- --scan data/ib/archive-manifests/archive-scan.json --sources may2015 --subjects Mathematics,Physics,Chemistry --limit-per-archive 5 --import
```

If you want a balanced sample for several subjects, prefer `--limit-per-subject`:

```bash
npm run ib:import-archive-root -- --scan data/ib/archive-manifests/archive-scan.json --sources may2015 --subjects Mathematics,Physics,Chemistry --limit-per-subject 5 --import
```

Recommended early subject order:

1. Mathematics
2. Physics
3. Chemistry
4. Biology
5. Economics

## Import Multiple Years Or Sessions

Use comma-separated source slugs from `archive-scan.json`:

```bash
npm run ib:import-archive-root -- --scan data/ib/archive-manifests/archive-scan.json --sources may2015,nov2015,may2016 --subjects Mathematics,Physics,Chemistry --import
```

## Import Every Scanned Source

Only do this after several small batches pass, because it can call the embedding API many times:

```bash
npm run ib:import-archive-root -- --scan data/ib/archive-manifests/archive-scan.json --all-subjects --import
```

If you already imported core subjects, exclude them to avoid spending time and embedding cost on reprocessing:

```bash
npm run ib:import-archive-root -- --scan data/ib/archive-manifests/archive-scan.json --all-subjects --exclude-subjects Mathematics,Physics,Chemistry --import
```

If you want to include papers without markschemes, add `--no-require-markscheme`. This is not recommended for diagnostic workflows because markschemes are important for scoring and weakness analysis.

```bash
npm run ib:import-archive-root -- --scan data/ib/archive-manifests/archive-scan.json --sources session2001 --subjects Mathematics --no-require-markscheme --import
```

## Legacy Archives

For older sources such as `2001-2008试题` and `2001-2008试题(1)`, many papers exist without complete markscheme pairing. In these cases:

```bash
npm run ib:import-archive-root -- --scan data/ib/archive-manifests/archive-scan.json --sources session2001 --subjects Mathematics --no-require-markscheme --import
```

Notes for legacy imports:

- `--no-require-markscheme` is usually necessary, otherwise the importer may find papers but still produce `materials: 0`.
- These older sources are more useful for retrieval breadth than for strict score-diagnosis workflows, because answer keys and markschemes may be incomplete.
- If `archive-scan.json` contains a stale or mis-encoded path for an old source, `ib:import-archive-root` now falls back to rediscovering the real folder under the scan root.
- Real validation result: `2001-2008` is a mixed legacy block, not a pure paper-only block. In the current local scan it still contains some valid paper + markscheme pairs.
- The helper still keeps legacy imports in tolerant mode because coverage is more important than strict pairing for this period.

## 2015-2025 Status

The `2015-2025` Mathematics, Physics, and Chemistry import path is now usable. The main issues that were blocking it were incomplete nested ZIP extraction for some years, especially `NOV2019` and `NOV2020`, and those have already been repaired.

What this means in practice:

- For `Mathematics`, `Physics`, and `Chemistry`, the current importer is good enough to continue batching through `2015-2025`.
- This does not automatically mean every year is equally clean for all subjects.
- Years like `May2019`, `2021`, `2022`, and `2024` have more varied internal layouts such as HTML exam packs, nested subfolders, alternate subject naming, or marked-paper bundles. Those are mostly manageable now, but they are the most likely places where future full-subject imports may need additional parsing rules.

## Single Archive Or Folder Import

You can still process one archive or folder directly:

```bash
npm run ib:import-archive -- --archive "D:\wendang\IB\May2015 papers.rar" --source-slug may2015-rar --subjects Mathematics --limit 2 --pairs-out data/ib/archive-manifests/may2015-rar-math-pairs.json --materials-out data/ib/archive-manifests/may2015-rar-math-materials.json --import
```

## Generated Files

The pipeline writes these files:

```text
data/ib/archive-manifests/archive-scan.json
data/ib/archive-manifests/<source-slug>-pairs.json
data/ib/archive-manifests/<source-slug>-materials.json
data/ib/source/<source-slug>/**
```

`*-pairs.json` is the paper/markscheme pairing result. `*-materials.json` is the import manifest consumed by `ib:import-materials`.

## Notes

- `--limit-per-archive` counts total paper/markscheme pairs after filtering, not individual files.
- `--limit-per-subject` counts paper/markscheme pairs independently for each subject and is better for balanced quality checks.
- Each matched pair usually imports two materials: one paper and one markscheme.
- The importer skips French, Spanish, and German variants by default.
- The importer now tolerates many nested source layouts, including inner ZIP/RAR exam packs inside a year folder, and it prefers already-extracted content when that content looks complete.
- Paths that look like invoices, macOS metadata, or marked-paper review bundles are skipped by default to reduce noise in full-subject imports.
- Material chunk vector IDs are stable, so re-importing the same material updates the same MongoDB chunk and Zilliz vector instead of creating duplicates.
- If a material was imported before stable chunk IDs existed, re-import that same source once to clean up its old random-vector duplicates.
- PDF text extraction can be noisy for scanned or formula-heavy papers.
- Tencent OCR cost note: `PAST_PAPER` repair uses `QuestionSplitOCR`, while `MARK_SCHEME` repair now defaults to cheaper `GeneralBasicOCR` and only falls back to `GeneralAccurateOCR` when the extracted markscheme quality is poor.
- You can control this with `.env.local` or `.env.ib.example`:
  `TENCENT_MARKSCHEME_OCR_PROVIDER=general_basic`
  `TENCENT_MARKSCHEME_FALLBACK_PROVIDER=general_accurate`
- `ib:repair-materials` now supports automatic resume. It writes a progress file under `data/ib/reports/repair-progress/` and skips completed `materialId`s on the next run.
- Resume also checks MongoDB for materials already repaired with the same provider and a `good`/`warn` quality level, so older runs that happened before the progress file existed can still be skipped.
- For Tencent OCR repair, resume only treats a material as completed when the fallback actually produced OCR text/pages/blocks. Older rows that were incorrectly marked as `pdf_parse_tencent_edu_ocr` after falling back to plain `pdf-parse` text will be repaired again.
- Markscheme and past-paper imports now prefer question-level chunks (`Q1`, `Q2`, etc.) before falling back to length-based chunks. This improves retrieval precision for prompts such as “Paper 1 Q3 markscheme”.
- The default progress file is shared by the same manifest/provider/filter set; `--offset` and `--limit` no longer create a separate progress file.
- To continue a partially completed repair batch from a known point, run once with `--offset ...`; after that, rerunning the same command will keep resuming automatically from the remaining materials. If the repaired materials were already written to MongoDB, the offset is optional.
- If you intentionally want to ignore prior progress and rerun the whole selected batch, add `--no-resume`.
- If you want to clear saved repair progress for a batch and rebuild it, add `--reset-progress`.
- The study assistant recommendation layer now has a separate student-facing quality gate. By default it only recommends `2015+` IB chunks with `good`/`warn` extraction quality and excludes materials marked `reviewRequired`.
- Configure this with `.env.local`:
  `STUDY_ASSISTANT_RECOMMENDATION_MIN_YEAR=2015`
  `STUDY_ASSISTANT_RECOMMENDATION_ALLOW_REVIEW_REQUIRED=false`
- Older materials such as `2001-2014` can stay in MongoDB/Zilliz for future repair or admin review, but they will not be pushed into student plans unless you lower the year gate or explicitly allow review-required materials.
- Question-level parsing and stronger knowledge-point auto-linking should be layered on top after the full-paper RAG baseline is stable.
- Keep using dry run first when adding a new year. It is cheap, quick, and catches naming-layout surprises before embedding costs happen.

## Pre-2015 STEM Batch Import

Use this helper when importing Mathematics, Physics, and Chemistry before 2015. It processes sources in small year batches, which is safer than one long command.

Current validated rule note:

- `2011-2013`: tolerant mode, do not require markscheme pairing.
- `2014`: strict paired mode, require paper + markscheme.
- `2001-2008`: mixed markscheme coverage exists, but the helper still uses tolerant mode.

First refresh the scan file if your local `D:\wendang\IB` folder changed:

```bash
npm run ib:scan-archives -- --root "D:\wendang\IB" --out data/ib/archive-manifests/archive-scan.json
```

If you want to validate representative import rules before running the helper:

```bash
npm run ib:validate-import-rules
```

Dry run the normal 2011-2014 sources:

```bash
npm run ib:import-pre2015-stem
```

Import the normal 2011-2014 sources:

```bash
npm run ib:import-pre2015-stem -- -Mode Import
```

Import with a fresh representative rule validation first:

```bash
npm run ib:import-pre2015-stem -- -Mode Import -ValidateRules
```

Import and run retrieval checks after each batch:

```bash
npm run ib:import-pre2015-stem -- -Mode Import -RunChecks
```

If you want a small sample first, limit each subject in each source:

```bash
npm run ib:import-pre2015-stem -- -LimitPerSubject 2

npm run ib:import-pre2015-stem -- -Mode Import -LimitPerSubject 2
```

After 2011-2014 looks good, import the legacy `2001-2008` folders. These are handled separately because many files do not have complete markscheme pairs:

```bash
npm run ib:import-pre2015-stem -- -Mode Import -IncludeLegacy
```

If you only want the legacy `2001-2008` folders and do not want to run `2011-2014` again:

```bash
npm run ib:import-pre2015-stem -- -Mode Import -OnlyLegacy
```

If `archive-scan.json` still contains an old source that no longer exists locally, the importer now skips that missing source and continues with the valid folders. Re-run `ib:scan-archives` whenever you rename, delete, or move local IB folders.

Legacy `2001-2008` folders use repeated file names such as `Physics HL P1.pdf` under different year folders. The manifest builder therefore uses the full relative path for deduping and pairing, and it infers `year` / `session` from paths such as `2003_Nov/...` instead of the top-level source slug.

Representative rule validation can also be scoped:

```bash
npm run ib:validate-import-rules -- --cases legacy-2001-2008,paper-only-2011,markscheme-2014,standard-2015,session-bundle-2021
```

And if you want a sample end-to-end write into MongoDB + Zilliz:

```bash
npm run ib:validate-import-rules -- --cases legacy-2001-2008,paper-only-2011,markscheme-2014 --import-sample
```

Equivalent manual batches:

```bash
npm run ib:import-archive-root -- --scan data/ib/archive-manifests/archive-scan.json --sources may2011,nov2011 --subjects Mathematics,Physics,Chemistry --no-require-markscheme --import

npm run ib:import-archive-root -- --scan data/ib/archive-manifests/archive-scan.json --sources may2012,nov2012 --subjects Mathematics,Physics,Chemistry --no-require-markscheme --import

npm run ib:import-archive-root -- --scan data/ib/archive-manifests/archive-scan.json --sources may2013,nov2013 --subjects Mathematics,Physics,Chemistry --no-require-markscheme --import

npm run ib:import-archive-root -- --scan data/ib/archive-manifests/archive-scan.json --sources may2014,nov2014 --subjects Mathematics,Physics,Chemistry --import

npm run ib:import-archive-root -- --scan data/ib/archive-manifests/archive-scan.json --sources session2001,session2001-2 --subjects Mathematics,Physics,Chemistry --no-require-markscheme --import
```

Recommended order:

1. Dry run `npm run ib:import-pre2015-stem`.
2. Import `npm run ib:import-pre2015-stem -- -Mode Import`.
3. Run `npm run ib:smoke-test-rag`.
4. Spot check the three subjects with `ib:evaluate-rag`.
5. Only then run `npm run ib:import-pre2015-stem -- -Mode Import -IncludeLegacy`.
