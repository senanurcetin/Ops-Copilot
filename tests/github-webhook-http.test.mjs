import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHmac } from 'node:crypto';
import { createGitHubWebhookRequestHandler, readBoundedWebhookBody } from '../scripts/github-webhook-http.mjs';

const secret = 'local-test-secret';
const deliveryId = '711c17df-3579-4c49-a3f1-4becc101abcd';
const config = {
  secret, expectedInstallationId: 11, expectedRepositoryId: 42,
  expectedRepository: 'example/private-repo',
};
function mockRequest(body, opts = {}) {
  const raw = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const request = Readable.from([raw]);
  request.url = opts.url ?? '/github/webhook';
  request.method = opts.method ?? 'POST';
  request.headers = {
    'content-type': 'application/json',
    'x-github-event': 'workflow_run',
    'x-github-delivery': deliveryId,
    'x-hub-signature-256': 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex'),
    ...opts.headers,
  };
  return request;
}
function payload(action='completed') {
  return JSON.stringify({
    action, installation: {id: 11},
    repository: {id: 42, full_name: 'example/private-repo'},
    workflow_run: {id: 765, repository_id: 42},
  });
}
function mockResponse() {
  return { code: null, headers: null, body: null,
    writeHead(code, headers) {this.code=code; this.headers=headers;},
    end(body) {this.body=JSON.parse(body);},
  };
}
async function run(request, enqueueOnce=async()=>true, extra={}) {
  const handle = createGitHubWebhookRequestHandler({...config, enqueueOnce, ...extra});
  const response = mockResponse();
  await handle(request, response);
  return response;
}

test('accepts verified, authorized delivery only after durable enqueue', async () => {
  const jobs=[];
  const response = await run(mockRequest(payload()), async work => {jobs.push(work); return true;});
  assert.equal(response.code, 202);
  assert.deepEqual(response.body, {status:'accepted'});
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].workflowRunId, 765);
});

test('responds idempotently to duplicate and ignored events', async () => {
  const duplicate=await run(mockRequest(payload()), async()=>false);
  assert.equal(duplicate.code,200);
  assert.deepEqual(duplicate.body,{status:'duplicate'});
  const ignored=await run(mockRequest(payload('requested')), async()=>{throw Error('never');});
  assert.equal(ignored.code,200);
  assert.deepEqual(ignored.body,{status:'ignored'});
});

test('rejects unsupported path, method and content type before reading payload', async () => {
  const notFound=await run(mockRequest(payload(),{url:'/github/webhook?debug=1'}));
  assert.equal(notFound.code,404);
  const method=await run(mockRequest(payload(),{method:'GET'}));
  assert.equal(method.code,405);
  assert.equal(method.headers.Allow,'POST');
  const content=await run(mockRequest(payload(),{headers:{'content-type':'text/plain'}}));
  assert.equal(content.code,415);
});

test('rejects altered signature and unauthorized repository', async () => {
  const bad=await run(mockRequest(payload(),{headers:{'x-hub-signature-256':'sha256='+'0'.repeat(64)}}));
  assert.equal(bad.code,401);
  const mismatch=JSON.parse(payload());
  mismatch.repository.id=999;
  const denied=await run(mockRequest(JSON.stringify(mismatch)));
  assert.equal(denied.code,403);
});

test('maps invalid metadata and malformed JSON to 400', async () => {
  const bad=await run(mockRequest(payload(),{headers:{'x-github-delivery':'not-uuid'}}));
  assert.equal(bad.code,400);
  const invalid=await run(mockRequest('{oops'));
  assert.equal(invalid.code,400);
});

test('returns 503 without leaking persistence errors or accepting request', async () => {
  const response=await run(mockRequest(payload()),async()=>{throw Error('db-password-internal');});
  assert.equal(response.code,503);
  assert.deepEqual(response.body,{status:'temporarily_unavailable'});
  assert.equal(JSON.stringify(response).includes('db-password-internal'),false);
});

test('rejects oversized bodies using Content-Length and actual bytes', async () => {
  const body=payload();
  const early=await run(mockRequest(body,{headers:{'content-length':'999'}}),async()=>true,{maxBytes:90});
  assert.equal(early.code,413);
  const streaming=await run(mockRequest(body),async()=>true,{maxBytes:90});
  assert.equal(streaming.code,413);
  const malformed=await run(mockRequest(body,{headers:{'content-length':'1.5'}}));
  assert.equal(malformed.code,400);
  const mismatched=await run(mockRequest(body,{headers:{'content-length':'1'}}));
  assert.equal(mismatched.code,400);
});

test('requires an explicit valid server configuration', () => {
  assert.throws(()=>createGitHubWebhookRequestHandler({...config,enqueueOnce:()=>true,secret:''}),/configuration/);
  assert.throws(()=>createGitHubWebhookRequestHandler({...config,enqueueOnce:()=>true,pathname:'/other'}),/configuration/);
});

test('bounded reader preserves exact byte content including UTF-8', async () => {
  const raw=Buffer.from('{"name":"Türkçe öİğ"}','utf8');
  const body=await readBoundedWebhookBody(mockRequest(raw));
  assert.equal(body.equals(raw),true);
});
