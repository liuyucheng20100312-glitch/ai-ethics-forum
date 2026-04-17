param(
  [ValidateSet("DryRun", "Import")]
  [string]$Mode = "DryRun",

  [string]$Scan = "data/ib/archive-manifests/archive-scan.json",

  [string]$Subjects = "Mathematics,Physics,Chemistry",

  [int]$LimitPerSubject = 0,

  [switch]$IncludeLegacy,

  [switch]$OnlyLegacy,

  [switch]$NoRequireMarkscheme,

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

Write-Host "IB pre-2015 STEM import mode: $Mode" -ForegroundColor Green
Write-Host "Subjects: $Subjects"
Write-Host "Scan: $Scan"

if (-not $OnlyLegacy) {
  Invoke-IbImportBatch -Label "2011 May + Nov (paper-only tolerant)" -Sources "may2011,nov2011" -AllowMissingMarkscheme
  Invoke-IbImportBatch -Label "2012 May + Nov (paper-only tolerant)" -Sources "may2012,nov2012" -AllowMissingMarkscheme
  Invoke-IbImportBatch -Label "2013 May + Nov (paper-only tolerant)" -Sources "may2013,nov2013" -AllowMissingMarkscheme
  Invoke-IbImportBatch -Label "2014 May + Nov" -Sources "may2014,nov2014"
}

if ($IncludeLegacy -or $OnlyLegacy) {
  Invoke-IbImportBatch `
    -Label "Legacy 2001-2008 folders" `
    -Sources "session2001,session2001-2" `
    -AllowMissingMarkscheme
}

Write-Host ""
Write-Host "Pre-2015 STEM import script completed." -ForegroundColor Green
