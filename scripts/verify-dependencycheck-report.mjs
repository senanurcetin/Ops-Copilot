import {readFileSync, statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const REPORT_URL = new URL('../reports/dependency-check-report.json', import.meta.url);
const MAX_REPORT_BYTES = 50 * 1024 * 1024;
const MAX_REPORT_AGE_MS = 3 * 60 * 60 * 1000;
const MAX_DATA_AGE_MS = 72 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 10 * 60 * 1000;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;

function fail() {
  // Never echo dependency file paths, raw advisories, tokens or JSON input.
  throw new Error('Dependency-Check evidence missing, stale or invalid.');
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseTimestamp(value) {
  if (typeof value !== 'string' || !ISO_TIMESTAMP.test(value)) fail();
  const explicitZone = value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value);
  const parsed = Date.parse(explicitZone ? value : value + 'Z');
  if (!Number.isFinite(parsed)) fail();
  return parsed;
}

function validateAge(timestamp, nowMs, maxAgeMs) {
  if (timestamp > nowMs + MAX_FUTURE_SKEW_MS || timestamp < nowMs - maxAgeMs) fail();
}

/**
 * Validate report *integrity and freshness*, not vulnerability safety.
 * A valid report can still list CVEs and does NOT authorize a release.
 * This is a pure bounded assessment of caller-provided scan evidence.
 */
export function assessDependencyCheckEvidence(report, {
  nowMs = Date.now(),
  maxReportAgeMs = MAX_REPORT_AGE_MS,
  maxDataAgeMs = MAX_DATA_AGE_MS,
} = {}) {
  if (!isRecord(report) || !Number.isSafeInteger(nowMs) || nowMs <= 0 ||
      !Number.isSafeInteger(maxReportAgeMs) || maxReportAgeMs <= 0 ||
      !Number.isSafeInteger(maxDataAgeMs) || maxDataAgeMs <= 0) fail();
  const {projectInfo, scanInfo, dependencies} = report;
  if (!/^1\.\d+$/.test(report.reportSchema) ||
      !isRecord(projectInfo) || projectInfo.name !== 'Ops-Copilot' ||
      !isRecord(scanInfo) ||
      !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(scanInfo.engineVersion) ||
      !Array.isArray(scanInfo.dataSource) ||
      !Array.isArray(dependencies) || dependencies.length === 0 ||
      dependencies.length > 100000) fail();

  const generatedAtMs = parseTimestamp(projectInfo.reportDate);
  validateAge(generatedAtMs, nowMs, maxReportAgeMs);

  // Dependency-Check 13 renamed the API freshness entry. Cache timestamps
  // alone are insufficient evidence of an NVD API freshness check.
  const nvdEvidence = scanInfo.dataSource.find(source =>
    isRecord(source) &&
    ['NVD CVE Checked', 'NVD API Last Checked'].includes(source.name));
  if (!nvdEvidence) fail();
  const nvdCheckedAtMs = parseTimestamp(nvdEvidence.timestamp);
  validateAge(nvdCheckedAtMs, nowMs, maxDataAgeMs);
  if (nvdCheckedAtMs > generatedAtMs + MAX_FUTURE_SKEW_MS) fail();

  if ((Array.isArray(scanInfo.analysisExceptions) &&
       scanInfo.analysisExceptions.length > 0) ||
      (Array.isArray(report.analysisExceptions) &&
       report.analysisExceptions.length > 0)) fail();

  let vulnerabilityCount = 0;
  let vulnerableDependencyCount = 0;
  let hasRootNpmManifest = false;
  for (const dependency of dependencies) {
    if (!isRecord(dependency) ||
        typeof dependency.fileName !== 'string' ||
        dependency.fileName.length === 0 ||
        (dependency.vulnerabilities !== undefined &&
         !Array.isArray(dependency.vulnerabilities))) fail();
    if (dependency.fileName === 'package.json' ||
        dependency.fileName === 'package-lock.json') {
      hasRootNpmManifest = true;
    }
    // Modern npm analyzers report virtual package dependencies and record the
    // scanned root manifest in projectReferences instead of its own fileName.
    // Reject nested manifests and non-npm references rather than accepting an
    // arbitrary path that merely ends with package-lock.json.
    if (Array.isArray(dependency.packages) && dependency.packages.some(pkg =>
      isRecord(pkg) && typeof pkg.id === 'string' && pkg.id.startsWith('pkg:npm/')) &&
      Array.isArray(dependency.projectReferences) &&
      dependency.projectReferences.some(reference => typeof reference === 'string' &&
        /^(?:\.\/)?package(?:-lock)?\.json(?:: (?:direct|transitive))?$/.test(reference))) {
      hasRootNpmManifest = true;
    }
    if (Array.isArray(dependency.vulnerabilities)) {
      const count = dependency.vulnerabilities.length;
      vulnerabilityCount += count;
      if (count > 0) vulnerableDependencyCount++;
    }
  }
  if (!hasRootNpmManifest) fail();

  return Object.freeze({
    evidenceStatus: 'integrity-checked-manual-review-required',
    dependencyCount: dependencies.length,
    vulnerableDependencyCount,
    reportedVulnerabilityCount: vulnerabilityCount,
    reportAgeMinutes: Math.max(0, Math.ceil((nowMs - generatedAtMs) / 60000)),
    nvdEvidenceAgeHours: Math.max(0, Math.ceil((nowMs - nvdCheckedAtMs) / 3600000)),
    databaseFreshnessIndependentlyVerified: false,
    dockerRuntimeDigestPinned: false,
    productionReleaseAuthorized: false,
  });
}

/**
 * Only the fixed workspace reports/ location is permitted; the generated
 * report stays out of public console output and is size-bounded.
 */
export function readDependencyCheckEvidence() {
  let bytes;
  try {
    const stat = statSync(REPORT_URL);
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_REPORT_BYTES) fail();
    bytes = readFileSync(REPORT_URL, 'utf8');
  } catch {
    fail();
  }
  let report;
  try {
    report = JSON.parse(bytes);
  } catch {
    fail();
  }
  return assessDependencyCheckEvidence(report);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) fail();
    const summary = readDependencyCheckEvidence();
    process.stdout.write(JSON.stringify(summary) + '\n');
  } catch {
    process.stderr.write('Dependency-Check evidence missing, stale or invalid.\n');
    process.exitCode = 1;
  }
}
