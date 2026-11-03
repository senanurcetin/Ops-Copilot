import test from 'node:test';
import assert from 'node:assert/strict';
import {assessDependencyCheckEvidence} from '../scripts/verify-dependencycheck-report.mjs';

const NOW = Date.parse('2026-11-04T00:00:00Z');
const baseReport = () => ({
  reportSchema:'1.1',
  projectInfo:{name:'Ops-Copilot', reportDate:'2026-11-03T23:45:00Z'},
  scanInfo:{
    engineVersion:'13.0.0',
    dataSource:[{name:'NVD CVE Checked', timestamp:'2026-11-03T23:00:00'}],
  },
  dependencies:[{fileName:'package-lock.json'}, {fileName:'react'}],
});
const assess=(report, options={})=>
  assessDependencyCheckEvidence(report,{nowMs:NOW,...options});

test('fresh report with NVD evidence and root npm manifest is integrity-checked only',()=>{
  const result=assess(baseReport());
  assert.equal(result.dependencyCount,2);
  assert.equal(result.reportedVulnerabilityCount,0);
  assert.equal(result.reportAgeMinutes,15);
  assert.equal(result.nvdEvidenceAgeHours,1);
  assert.equal(result.productionReleaseAuthorized,false);
  assert.equal(result.databaseFreshnessIndependentlyVerified,false);
  assert.equal(result.dockerRuntimeDigestPinned,false);
  assert.equal(Object.isFrozen(result),true);
});

test('reported vulnerabilities are counted but never grant security clearance',()=>{
  const report=baseReport();
  report.dependencies[1].vulnerabilities=[
    {name:'SECRET-ADVISORY-123', severity:'CRITICAL'},
    {name:'SECRET-ADVISORY-456', severity:'HIGH'},
  ];
  const result=assess(report);
  assert.equal(result.reportedVulnerabilityCount,2);
  assert.equal(result.vulnerableDependencyCount,1);
  assert.equal(result.productionReleaseAuthorized,false);
  assert.equal(JSON.stringify(result).includes('SECRET'),false);
});

test('stale or future scan report fails closed',()=>{
  for(const date of ['2026-11-03T20:00:00Z','2026-11-04T00:11:00Z']){
    const r=baseReport();r.projectInfo.reportDate=date;
    assert.throws(()=>assess(r),/evidence missing, stale or invalid/);
  }
});

test('old NVD evidence or missing NVD checked source is rejected',()=>{
  const old=baseReport();
  old.scanInfo.dataSource[0].timestamp='2026-10-30T00:00:00Z';
  assert.throws(()=>assess(old));
  const noNvd=baseReport();
  noNvd.scanInfo.dataSource=[{name:'other',timestamp:'2026-11-03T00:00:00Z'}];
  assert.throws(()=>assess(noNvd));
});

test('NVD timestamp far after scan date is rejected',()=>{
  const r=baseReport();
  r.scanInfo.dataSource[0].timestamp='2026-11-04T00:01:00Z';
  r.projectInfo.reportDate='2026-11-03T23:00:00Z';
  assert.throws(()=>assess(r));
});

test('missing or misleading metadata and schema are rejected',()=>{
  for(const tweak of [
    r=>{r.reportSchema='wrong';},
    r=>{r.projectInfo.name='Other';},
    r=>{r.projectInfo.reportDate='yesterday';},
    r=>{r.scanInfo.engineVersion='garbage';},
    r=>{r.scanInfo.dataSource='not-an-array';},
  ]){
    const r=baseReport();tweak(r);
    assert.throws(()=>assess(r));
  }
});

test('empty scan and reports with no npm manifest are rejected',()=>{
  const empty=baseReport();empty.dependencies=[];
  assert.throws(()=>assess(empty));
  const noNpm=baseReport();noNpm.dependencies=[{fileName:'unknown.jar'}];
  assert.throws(()=>assess(noNpm));
});

test('invalid dependency entries fail instead of being counted as zero',()=>{
  for(const list of [[null],[{}],[{fileName:'package.json',vulnerabilities:'nothing'}]]){
    const r=baseReport();r.dependencies=list;
    assert.throws(()=>assess(r));
  }
});

test('explicit analyzer errors are rejected even if report has a manifest',()=>{
  const r=baseReport();r.scanInfo.analysisExceptions=['SECRET-STACK'];
  assert.throws(()=>assess(r));
  const other=baseReport();other.analysisExceptions=[{message:'SECRET-ERROR'}];
  assert.throws(()=>assess(other));
});

test('invalid clock and options fail closed',()=>{
  assert.throws(()=>assess(baseReport(),{nowMs:0}));
  assert.throws(()=>assess(baseReport(),{maxDataAgeMs:-1}));
  assert.throws(()=>assess(baseReport(),{maxReportAgeMs:NaN}));
});

test('malicious or secret report fields never leak into sanitized errors or output',()=>{
  const report=baseReport();
  report.projectInfo.name='SECRET-REPOSITORY';
  report.dependencies[0].filePath='secret/private/path';
  assert.throws(()=>assess(report),error=>
    !error.message.includes('SECRET') && !error.message.includes('private'));
  const clean=baseReport();
  clean.projectInfo.private='SECRET';
  assert.equal(JSON.stringify(assess(clean)).includes('SECRET'),false);
});

test('invalid arbitrary structures fail closed',()=>{
  for(const x of [null,undefined,[],{'__proto__':null},'json-not-an-object']){
    assert.throws(()=>assess(x));
  }
});
