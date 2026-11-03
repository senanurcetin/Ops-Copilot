import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from 'firebase/app';
import {
  getFirestore as getClientFirestore, connectFirestoreEmulator,
  doc, getDoc, setDoc,
} from 'firebase/firestore';
import { createFirestoreWebhookOutbox } from '../scripts/github-webhook-firestore-outbox.mjs';
import { enqueueAuthorizedGitHubDelivery } from '../scripts/github-webhook-gate.mjs';
import { createGitHubWebhookRequestHandler } from '../scripts/github-webhook-http.mjs';

const PROJECT_ID = 'demo-nexus-ops-isolation';
const SECRET = 'synthetic-webhook-emulator-only';
const CONFIG = Object.freeze({
  secret: SECRET,
  expectedInstallationId: 11,
  expectedRepositoryId: 42,
  expectedRepository: 'example/private-repo',
});

function assertLocalOnly() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' ||
      process.env.FIREBASE_PROJECT_ID !== PROJECT_ID) {
    throw new Error('Refusing webhook outbox tests outside exact localhost demo Firebase emulators.');
  }
}

function makeDelivery(deliveryId, overrides = {}, event = 'workflow_run') {
  const payload = {
    action: 'completed',
    installation: { id: 11 },
    repository: { id: 42, full_name: 'example/private-repo' },
    workflow_run: { id: 765, repository_id: 42 },
    ...overrides,
  };
  const rawBody = Buffer.from(JSON.stringify(payload));
  const headers = {
    'content-type': 'application/json',
    'x-github-event': event,
    'x-github-delivery': deliveryId,
    'x-hub-signature-256': 'sha256=' + createHmac('sha256', SECRET).update(rawBody).digest('hex'),
  };
  return { rawBody, headers };
}

function newAdmin() {
  const app = initializeApp({ projectId: PROJECT_ID }, 'webhook-emulator-' + randomUUID());
  return { app, db: getFirestore(app) };
}

async function closeAdmin(instance) {
  await instance.db.terminate();
  await deleteApp(instance.app);
}

test('24 simultaneous signed deliveries produce one Firestore outbox document across two clients', async () => {
  assertLocalOnly();
  const a = newAdmin();
  const b = newAdmin();
  const deliveryId = randomUUID();
  const request = makeDelivery(deliveryId);
  const ref = a.db.doc('githubWebhookOutbox/' + deliveryId);
  try {
    const callbacks = [createFirestoreWebhookOutbox(a.db), createFirestoreWebhookOutbox(b.db)];
    const results = await Promise.all(Array.from({ length: 24 }, (_, index) =>
      enqueueAuthorizedGitHubDelivery({
        ...CONFIG, ...request, enqueueOnce: callbacks[index % callbacks.length],
      })));
    assert.equal(results.filter(item => item.status === 'enqueued').length, 1);
    assert.equal(results.filter(item => item.status === 'duplicate').length, 23);
    const record = await ref.get();
    assert.equal(record.exists, true);
    assert.deepEqual(record.data(), {
      deliveryId, event: 'workflow_run', action: 'completed',
      installationId: 11, repositoryId: 42,
      repository: 'example/private-repo', workflowRunId: 765,
      state: 'queued', attempts: 0,
      enqueuedAtMs: record.data().enqueuedAtMs,
    });
    assert.equal(typeof record.data().enqueuedAtMs, 'number');
    assert.equal(record.data().token, undefined);
    assert.equal(record.data().payload, undefined);

    // A different Admin client observes the committed delivery, simulating
    // restart/reconnect without relying on an in-memory process-local Set.
    const c = newAdmin();
    try {
      const result = await enqueueAuthorizedGitHubDelivery({
        ...CONFIG, ...request, enqueueOnce: createFirestoreWebhookOutbox(c.db),
      });
      assert.equal(result.status, 'duplicate');
      assert.equal((await c.db.doc('githubWebhookOutbox/' + deliveryId).get()).exists, true);
    } finally {
      await closeAdmin(c);
    }
  } finally {
    await ref.delete();
    await Promise.all([closeAdmin(a), closeAdmin(b)]);
  }
});

test('authorization and event allowlist reject before any Firestore document write', async () => {
  assertLocalOnly();
  const a = newAdmin();
  const enqueueOnce = createFirestoreWebhookOutbox(a.db);
  try {
    for (const overrides of [
      { installation: { id: 99 } },
      { repository: { id: 99, full_name: 'example/private-repo' } },
      { repository: { id: 42, full_name: 'elsewhere/repo' } },
    ]) {
      const deliveryId = randomUUID();
      const request = makeDelivery(deliveryId, overrides);
      await assert.rejects(
        enqueueAuthorizedGitHubDelivery({ ...CONFIG, ...request, enqueueOnce }),
        /not authorized/,
      );
      assert.equal((await a.db.doc('githubWebhookOutbox/' + deliveryId).get()).exists, false);
    }
    const ignoredId = randomUUID();
    const ignored = await enqueueAuthorizedGitHubDelivery({
      ...CONFIG,
      ...makeDelivery(ignoredId, { action: 'requested' }),
      enqueueOnce,
    });
    assert.equal(ignored.status, 'ignored');
    assert.equal((await a.db.doc('githubWebhookOutbox/' + ignoredId).get()).exists, false);
  } finally {
    await closeAdmin(a);
  }
});

test('rolled-back Firestore emulator transaction returns HTTP 503 without persisting work', async () => {
  assertLocalOnly();
  const a = newAdmin();
  const deliveryId = randomUUID();
  const { rawBody, headers } = makeDelivery(deliveryId);
  let attemptedWrites = 0;
  try {
    // Execute a real emulator transaction with a read + staged create, but
    // reject before commit. This tests rollback without triggering an SDK
    // internal unhandled rejection from using a terminated client.
    const rollbackDatabase = {
      collection: name => a.db.collection(name),
      runTransaction: callback => a.db.runTransaction(async transaction => {
        await callback(transaction);
        attemptedWrites += 1;
        throw new Error('synthetic-emulator-transaction-rollback');
      }),
    };
    const enqueueOnce = createFirestoreWebhookOutbox(rollbackDatabase);
    const handler = createGitHubWebhookRequestHandler({ ...CONFIG, enqueueOnce });
    const request = Readable.from([rawBody]);
    request.method = 'POST';
    request.url = '/github/webhook';
    request.headers = headers;
    const response = {
      statusCode: null, data: null,
      writeHead(code) { this.statusCode = code; },
      end(value) { this.data = JSON.parse(value); },
    };
    await handler(request, response);
    assert.equal(attemptedWrites, 1);
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.data, { status: 'temporarily_unavailable' });
    assert.equal((await a.db.doc('githubWebhookOutbox/' + deliveryId).get()).exists, false);
  } finally {
    await closeAdmin(a);
  }
});

test('Firestore security rules deny browser access to admin-only webhook outbox', async () => {
  assertLocalOnly();
  const app = initializeClientApp({
    apiKey: 'demo-emulator-only',
    authDomain: PROJECT_ID + '.firebaseapp.com',
    projectId: PROJECT_ID,
  }, 'webhook-client-' + randomUUID());
  try {
    const client = getClientFirestore(app);
    connectFirestoreEmulator(client, '127.0.0.1', 8080);
    const ref = doc(client, 'githubWebhookOutbox', randomUUID());
    await assert.rejects(getDoc(ref), /permission|PERMISSION_DENIED/i);
    await assert.rejects(setDoc(ref, { state: 'queued' }), /permission|PERMISSION_DENIED/i);
  } finally {
    await deleteClientApp(app);
  }
});
