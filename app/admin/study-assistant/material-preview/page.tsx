import Link from "next/link";
import type { ReactNode } from "react";
import { connectToDatabase } from "@/lib/mongodb";
import { getStudyMaterialPreview, StudyMaterialPreviewItem } from "@/lib/study-assistant";
import { getPublicMaterialUrl } from "@/lib/study-material-links";

type SearchParamsInput = Record<string, string | string[] | undefined>;

type MaterialPreviewPageProps = {
  searchParams?: Promise<SearchParamsInput>;
};

function pickParam(params: SearchParamsInput, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) {
    return value[0]?.trim() || "";
  }
  return typeof value === "string" ? value.trim() : "";
}

function renderMetaRow(label: string, value: string) {
  if (!value) {
    return null;
  }

  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm text-slate-700">{value}</div>
    </div>
  );
}

function normalizeMathText(value: string): string {
  return value
    .replace(/\s*\$\s*/g, "")
    .replace(/\\varnothing/g, "∅")
    .replace(/\\emptyset/g, "∅")
    .replace(/\\Rightarrow/g, "⇒")
    .replace(/\\rightarrow/g, "→")
    .replace(/\\implies/g, "⇒")
    .replace(/\\therefore/g, "∴")
    .replace(/\\cap/g, "∩")
    .replace(/\\cup/g, "∪")
    .replace(/\\notin/g, "∉")
    .replace(/\\neq/g, "≠")
    .replace(/\\ne/g, "≠")
    .replace(/\\in/g, "∈")
    .replace(/\\subseteq/g, "⊆")
    .replace(/\\subset/g, "⊂")
    .replace(/\\geq/g, "≥")
    .replace(/\\leq/g, "≤")
    .replace(/\\times/g, "×")
    .replace(/\\div/g, "÷")
    .replace(/\\pm/g, "±")
    .replace(/\\mathrm\{([^}]+)\}/g, "$1")
    .replace(/\\operatorname\{([^}]+)\}/g, "$1")
    .replace(/\^\\?\{-?1\}/g, "⁻¹")
    .replace(/\^\\?\{2\}/g, "²")
    .replace(/\^\\?\{3\}/g, "³")
    .replace(/\^\\?\{([^}]+)\}/g, "^($1)")
    .replace(/_\\?\{([^}]+)\}/g, "₍$1₎")
    .replace(/_([0-9a-zA-Z])/g, "₍$1₎")
    .replace(/\\,/g, " ")
    .replace(/\\;/g, " ")
    .replace(/\\ /g, " ")
    .replace(/\\/g, "");
}

function renderInlineText(value: string): ReactNode[] {
  return value
    .split(/(\*\*[^*]+\*\*)/g)
    .filter((part) => part.length > 0)
    .map((part, index) => {
      const strongMatch = part.match(/^\*\*([^*]+)\*\*$/);
      if (strongMatch) {
        return <strong key={index}>{normalizeMathText(strongMatch[1])}</strong>;
      }
      return <span key={index}>{normalizeMathText(part)}</span>;
    });
}

function renderReadableContent(content: string) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const rendered: ReactNode[] = [];
  let tableRows: string[][] = [];

  const flushTable = () => {
    if (tableRows.length === 0) {
      return;
    }

    const rows = tableRows;
    tableRows = [];
    const [head, maybeDivider, ...body] = rows;
    const hasDivider = maybeDivider?.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
    const bodyRows = hasDivider ? body : rows.slice(1);

    rendered.push(
      <div key={`table-${rendered.length}`} className="my-4 overflow-x-auto rounded-2xl border border-cyan-100 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-cyan-50 text-slate-700">
            <tr>
              {head.map((cell, index) => (
                <th key={index} className="px-3 py-2 font-semibold">
                  {renderInlineText(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bodyRows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-cyan-50">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-3 py-2 align-top">
                    {renderInlineText(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const tableCells =
      trimmed.startsWith("|") && trimmed.endsWith("|")
        ? trimmed
            .slice(1, -1)
            .split("|")
            .map((cell) => cell.trim())
        : null;

    if (tableCells && tableCells.length > 1) {
      tableRows.push(tableCells);
      return;
    }

    flushTable();

    if (!trimmed) {
      rendered.push(<div key={index} className="h-3" />);
      return;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const sizeClass =
        heading[1].length <= 2
          ? "text-base font-semibold text-slate-950"
          : "text-sm font-semibold text-slate-800";
      rendered.push(
        <div key={index} className={`${sizeClass} mt-3 first:mt-0`}>
          {renderInlineText(heading[2])}
        </div>
      );
      return;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      rendered.push(
        <div key={index} className="flex gap-2">
          <span className="mt-[0.65em] h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" />
          <span>{renderInlineText(bullet[1])}</span>
        </div>
      );
      return;
    }

    rendered.push(
      <p key={index} className="my-1">
        {renderInlineText(trimmed)}
      </p>
    );
  });

  flushTable();
  return rendered;
}

function renderMaterialSection(
  title: string,
  item: StudyMaterialPreviewItem | null,
  emptyText: string
) {
  if (!item) {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
        {emptyText}
      </div>
    );
  }

  const sourceUrl = getPublicMaterialUrl(item.sourceUrl);
  const readableContent = item.readableContent || item.content;

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-500">{title}</p>
      <h2 className="mt-2 text-2xl font-semibold text-slate-900">{item.title}</h2>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {renderMetaRow("Type", item.materialType)}
        {renderMetaRow("Source", item.sourceTitle)}
        {renderMetaRow("Question", item.questionRef || "Not identified")}
      </div>

      {sourceUrl ? (
        <div className="mt-4">
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-full bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
          >
            打开原始资料链接
          </a>
        </div>
      ) : null}

      <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Excerpt</div>
        <div className="mt-2 text-sm leading-7 text-slate-700">{renderReadableContent(item.excerpt)}</div>
      </div>

      <div className="mt-5 rounded-[24px] border border-cyan-100 bg-cyan-50/60 px-5 py-4">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-600">
          {item.hasReadableContent ? "Readable Study Version" : "Study Content"}
        </div>
        <div className="mt-3 max-h-[560px] overflow-auto text-sm leading-7 text-slate-800">
          {renderReadableContent(readableContent)}
        </div>
      </div>

      {item.hasReadableContent && item.content ? (
        <details className="mt-5 rounded-[24px] border border-slate-200 bg-white px-5 py-4">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            原始 OCR 证据
          </summary>
          <div className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-500">
            {item.content}
          </div>
        </details>
      ) : null}
    </section>
  );
}

export default async function StudyAssistantMaterialPreviewPage({
  searchParams,
}: MaterialPreviewPageProps) {
  const params = searchParams ? await searchParams : {};
  const chunkId = pickParam(params, "chunkId");
  const materialId = pickParam(params, "materialId");
  const pairedMarkschemeChunkId = pickParam(params, "pairedMarkschemeChunkId");
  const title = pickParam(params, "title");
  const pairedTitle = pickParam(params, "pairedTitle");

  const { db } = await connectToDatabase();
  const preview = await getStudyMaterialPreview(db, {
    chunkId,
    materialId,
    pairedMarkschemeChunkId,
    fallbackTitle: title,
    pairedFallbackTitle: pairedTitle,
  });

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#ecfeff,white_42%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Study Material Preview</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">任务资料预览</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              这里展示系统命中的题目片段和评分细则片段。即使原始文件没有公开链接，也可以先在这里直接完成练习与对照。
            </p>
          </div>
          <Link
            href="/admin/study-assistant"
            className="inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-300"
          >
            返回学习助手
          </Link>
        </div>

        {renderMaterialSection("练习题片段", preview.primary, "当前没有可展示的主资料片段。")}
        {renderMaterialSection("配套评分细则", preview.pairedMarkscheme, "当前任务没有绑定评分细则片段。")}
      </div>
    </main>
  );
}
