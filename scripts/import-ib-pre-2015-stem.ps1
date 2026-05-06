param(
  [ValidateSet("DryRun", "Import")]
  [string]$Mode = "DryRun",

  [string]$Scan = "data/ib/archive-manifests/archive-scan.json",

  [string]$Subjects = "Mathematics,Physics,Chemistry",

  [int]$LimitPerSubject = 0,

  [switch]$IncludeLegacy,

  [switch]$OnlyLegacy,

  [switch]$NoRequireMarkscheme,

  [switch]$ValidateRules,

  [switch]$RunChecks
)

$ErrorActionPreference = "Stop"

function Invoke-IbRagChecks {
  Write-Host ""
  Write-Host "=== RAG smoke check ===" -ForegroundColor Yellow

  & npm run ib:smoke-test-rag
  if ($LASTEXITCODE -ne 0) {
    throw "ib:smoke-test-rag failed"
  }

  $queries = @(
    @{ Subject = "Mathematics"; Query = "IB Mathematics calculus derivative Paper 1 markscheme"; Types = "MARK_SCHEME" },
    @{ Subject = "Physics"; Query = "IB Physics mechanics forces Paper 2 markscheme"; Types = "MARK_SCHEME" },
    @{ Subject = "Chemistry"; Query = "IB Chemistry stoichiometry mole calculations Paper 1 markscheme"; Types = "MARK_SCHEME" }
  )

  foreach ($item in $queries) {
    & npm run ib:evaluate-rag -- --subject $item.Subject --query $item.Query --types $item.Types --limit 5
    if ($LASTEXITCODE -ne 0) {
      throw "ib:evaluate-rag failed for $($item.Subject)"
    }
  }
}

function Invoke-IbRuleValidation {
  Write-Host ""
  Write-Host "=== Import rule validation ===" -ForegroundColor Yellow

  & npm run ib:validate-import-rules -- --cases "legacy-2001-2008,paper-only-2011,paper-only-2013,markscheme-2014"
  if ($LASTEXITCODE -ne 0) {
    throw "ib:validate-import-rules failed"
  }
}

function Invoke-IbImportBatch {
  param(
    [string]$Sources,
    [string]$Label,
    [switch]$AllowMissingMarkscheme
  )

  Write-Host ""
  Write-Host "=== $Label ===" -ForegroundColor Cyan

  $args = @(
    "run",
    "ib:import-archive-root",
    "--",
    "--scan",
    $Scan,
    "--sources",
    $Sources,
    "--subjects",
    $Subjects
  )

  if ($LimitPerSubject -gt 0) {
    $args += @("--limit-per-subject", [string]$LimitPerSubject)
  }

  if ($Mode -eq "Import") {
    $args += "--import"
  }

  if ($AllowMissingMarkscheme -or $NoRequireMarkscheme) {
    $args += "--no-require-markscheme"
  }

  & npm @args

  if ($LASTEXITCODE -ne 0) {
    throw "IB import batch failed: $Label"
  }

  if ($Mode -eq "Import" -and $RunChecks) {
    Invoke-IbRagChecks
  }
}

function Write-Pre2015StrategySummary {
  Write-Host ""
  Write-Host "Strategy summary:" -ForegroundColor Yellow
  Write-Host "- 2011-2013: tolerant mode, do not require markscheme pairing."
  Write-Host "- 2014: strict paired mode, require paper + markscheme."
  Write-Host "- 2001-2008 legacy: mixed markscheme coverage exists, but helper still uses tolerant mode for breadth and stability."
  Write-Host "- If you need to re-check rule behavior first, add -ValidateRules."
}

Write-Host "IB pre-2015 STEM import mode: $Mode" -ForegroundColor Green
Write-Host "Subjects: $Subjects"
Write-Host "Scan: $Scan"
Write-Pre2015StrategySummary

if ($ValidateRules) {
  Invoke-IbRuleValidation
}

if (-not $OnlyLegacy) {
  Invoke-IbImportBatch -Label "2011 May + Nov (paper-only tolerant)" -Sources "may2011,nov2011" -AllowMissingMarkscheme
  Invoke-IbImportBatch -Label "2012 May + Nov (paper-only tolerant)" -Sources "may2012,nov2012" -AllowMissingMarkscheme
  Invoke-IbImportBatch -Label "2013 May + Nov (paper-only tolerant)" -Sources "may2013,nov2013" -AllowMissingMarkscheme
  Invoke-IbImportBatch -Label "2014 May + Nov (strict paired mode)" -Sources "may2014,nov2014"
}

if ($IncludeLegacy -or $OnlyLegacy) {
  Invoke-IbImportBatch `
    -Label "Legacy 2001-2008 folders (mixed markscheme coverage, tolerant mode)" `
    -Sources "session2001,session2001-2" `
    -AllowMissingMarkscheme
}

Write-Host ""
Write-Host "Pre-2015 STEM import script completed." -ForegroundColor Green
