import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { createServer, connect } from 'node:net';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from 'firebase/app';
import {
  getFirestore as getClientFirestore, connectFirestoreEmulator,
  doc, getDoc, setDoc,
} from 'firebase/firestore';
import { createFirestoreWebhookOutbox } from '../scripts/github-webhook-firestore-outbox.mjs';
import { createDualAnchorWebhookOutbox } from '../scripts/github-webhook-dual-anchor-outbox.mjs';
import { createWebhookOutboxWorker } from '../scripts/github-webhook-outbox-worker.mjs';
import { createWebhookDeadLetterRecovery } from '../scripts/github-webhook-deadletter-recovery.mjs';
import { createWebhookOutboxCompactor } from '../scripts/github-webhook-outbox-retention.mjs';
import { analyzeWebhookRetentionSnapshot } from '../scripts/github-webhook-retention-inventory.mjs';
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


test('two Admin Firestore clients grant only one concurrent worker lease and terminal completion', async () => {
  assertLocalOnly();
  const a = newAdmin();
  const b = newAdmin();
  const deliveryId = randomUUID();
  const ref = a.db.doc('githubWebhookOutbox/' + deliveryId);
  try {
    await createFirestoreWebhookOutbox(a.db)({
      deliveryId, event: 'workflow_run', action: 'completed',
      installationId: 11, repositoryId: 42,
      repository: 'example/private-repo', workflowRunId: 765,
    });
    const workers = [
      createWebhookOutboxWorker(a.db),
      createWebhookOutboxWorker(b.db),
    ];
    const attempts = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      workers[i % workers.length].claim(deliveryId, 'worker-' + i)));
    const claims = attempts.filter(Boolean);
    assert.equal(claims.length, 1);
    assert.equal((await ref.get()).data().attempts, 1);
    const successful = await workers[0].complete(
      deliveryId, 'worker-' + attempts.indexOf(claims[0]), claims[0].leaseToken);
    assert.equal(successful, true);
    assert.equal((await ref.get()).data().state, 'completed');
    assert.equal(await workers[1].claim(deliveryId, 'worker-new'), null);
  } finally {
    await ref.delete();
    await Promise.all([closeAdmin(a), closeAdmin(b)]);
  }
});


test('owner-approved dead-letter recovery is transactional across two Admin Firestore clients', async () => {
  assertLocalOnly();
  const a = newAdmin();
  const b = newAdmin();
  const deliveryId = randomUUID();
  const ref = a.db.doc('githubWebhookOutbox/' + deliveryId);
  const deadAtMs = 10000;
  try {
    await ref.set({
      deliveryId, state: 'dead', attempts: 5, deadAtMs,
      event: 'workflow_run', action: 'completed',
      installationId: 11, repositoryId: 42,
      repository: 'example/private-repo', workflowRunId: 765,
      leaseOwner: null, leaseToken: null, leaseUntilMs: 0,
      failureCode: 'ATTEMPTS_EXHAUSTED',
    });
    const reviewers = [
      createWebhookDeadLetterRecovery(a.db, {
        authorizeRecovery: async () => true, nowMs: () => 30000,
      }),
      createWebhookDeadLetterRecovery(b.db, {
        authorizeRecovery: async () => true, nowMs: () => 30000,
      }),
    ];
    const requests = Array.from({length: 12}, (_, i) =>
      reviewers[i % 2]({deliveryId, operatorId: 'owner-reviewer', expectedDeadAtMs: deadAtMs}));
    const results = await Promise.all(requests);
    assert.equal(results.filter(r => r.status === 'requeued').length, 1);
    assert.equal(results.filter(r => r.status === 'not_dead').length, 11);
    const updated = (await ref.get()).data();
    assert.equal(updated.state, 'queued');
    assert.equal(updated.attempts, 0);
    assert.equal(updated.recoveryCount, 1);
    assert.equal(updated.deliveryId, deliveryId);
    assert.equal(updated.workflowRunId, 765);
    assert.equal(updated.leaseToken, null);
  } finally {
    await ref.delete();
    await Promise.all([closeAdmin(a), closeAdmin(b)]);
  }
});


test('terminal record compaction retains GUID and prevents new enqueue after reconnect', async () => {
  assertLocalOnly();
  const a = newAdmin();
  const b = newAdmin();
  const deliveryId = randomUUID();
  const ref = a.db.doc('githubWebhookOutbox/' + deliveryId);
  const now = Date.now();
  const completedAtMs = now - 9 * 86400000;
  try {
    await ref.set({
      deliveryId, event: 'workflow_run', action: 'completed',
      installationId: 11, repositoryId: 42, repository: 'example/private-repo',
      workflowRunId: 765, state: 'completed', attempts: 3,
      enqueuedAtMs: completedAtMs - 3000, completedAtMs,
      leaseOwner: null, leaseToken: null, leaseUntilMs: 0,
      failureCode: 'OLD_FAILURE', transientField: 'remove-me',
    });
    const compactors = [createWebhookOutboxCompactor(a.db, {
      authorizeCompaction: async () => true, nowMs: () => now,
    }), createWebhookOutboxCompactor(b.db, {
      authorizeCompaction: async () => true, nowMs: () => now,
    })];
    const outcomes = await Promise.all(Array.from({length: 12}, (_, index) =>
      compactors[index % 2]({
        deliveryId, operatorId: 'owner-reviewer', expectedCompletedAtMs: completedAtMs,
      })));
    assert.equal(outcomes.filter(o => o.status === 'compacted').length, 1);
    assert.equal(outcomes.filter(o => o.status === 'already_compacted').length, 11);
    const record = (await ref.get()).data();
    assert.equal(record.retentionClass, 'dedup_anchor_v1');
    assert.equal(record.failureCode, undefined);
    assert.equal(record.transientField, undefined);
    assert.equal(record.state, 'completed');
    assert.equal(record.deliveryId, deliveryId);
    // The existing outbox adapter checks the same GUID path transactionally.
    const again = await createFirestoreWebhookOutbox(b.db)({
      deliveryId, event: 'workflow_run', action: 'completed',
      installationId: 11, repositoryId: 42,
      repository: 'example/private-repo', workflowRunId: 765,
    });
    assert.equal(again, false);
    assert.equal(await createWebhookOutboxWorker(b.db).claim(deliveryId, 'worker-new'), null);
  } finally {
    await ref.delete();
    await Promise.all([closeAdmin(a), closeAdmin(b)]);
  }
});

test('isolated localhost Firestore transport outage returns 503 and recovery deduplicates', async () => {
  assertLocalOnly();
  const admin = newAdmin();
  const deliveryId = randomUUID();
  const ref = admin.db.doc('githubWebhookOutbox/' + deliveryId);
  const raw = makeDelivery(deliveryId);
  let online = true;
  const sockets = new Set();
  const server = createServer(client => {
    sockets.add(client);
    client.on('error', () => {});
    client.on('close', () => sockets.delete(client));
    if (!online) { client.destroy(); return; }
    const upstream = connect(8080, '127.0.0.1');
    sockets.add(upstream);
    upstream.on('error', () => client.destroy());
    upstream.on('close', () => {sockets.delete(upstream); client.destroy();});
    client.on('close', () => upstream.destroy());
    client.pipe(upstream).pipe(client);
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const probe = () => fetch(
      'http://127.0.0.1:' + address.port +
      '/v1/projects/demo-nexus-ops-isolation/databases/(default)/documents',
      {signal: AbortSignal.timeout(2500)},
    );
    const enqueueReal = createFirestoreWebhookOutbox(admin.db);
    const enqueueGuarded = async work => {
      // Failure injection through a *separate localhost TCP transport proxy*.
      // The normal Admin client still targets the original 8080 emulator.
      // Do not represent this check as proof of Admin SDK failover behavior.
      try {
        const response = await probe();
        await response.arrayBuffer();
      } catch {
        throw new Error('injected-emulator-transport-offline');
      }
      return enqueueReal(work);
    };
    const handle = createGitHubWebhookRequestHandler({...CONFIG, enqueueOnce: enqueueGuarded});
    async function invoke() {
      const request = Readable.from([raw.rawBody]);
      request.url = '/github/webhook';
      request.method = 'POST';
      request.headers = raw.headers;
      const res = {
        statusCode: null, body: null,
        writeHead(code) {this.statusCode = code;},
        end(body) {this.body = JSON.parse(body);},
      };
      await handle(request, res);
      return res;
    }

    const onlineProbe = await probe();
    await onlineProbe.arrayBuffer();
    online = false;
    for (const socket of sockets) socket.destroy();
    const outage = await invoke();
    assert.equal(outage.statusCode, 503);
    assert.deepEqual(outage.body, {status: 'temporarily_unavailable'});
    assert.equal((await ref.get()).exists, false);

    online = true;
    const recovered = await invoke();
    assert.equal(recovered.statusCode, 202);
    assert.equal((await ref.get()).exists, true);
    const replay = await invoke();
    assert.equal(replay.statusCode, 200);
    assert.deepEqual(replay.body, {status:'duplicate'});
  } finally {
    online = false;
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(() => resolve()));
    await ref.delete();
    await closeAdmin(admin);
  }
});


test('read-only inventory measures emulator documents without leaking delivery IDs', async () => {
  assertLocalOnly();
  const a = newAdmin();
  const deliveryIds = [randomUUID(), randomUUID(), randomUUID()];
  const refs = deliveryIds.map(id => a.db.doc('githubWebhookOutbox/' + id));
  const nowMs = 21 * 86400000;
  const base = id => ({
    deliveryId: id, event: 'workflow_run', action: 'completed',
    installationId: 11, repositoryId: 42,
    repository: 'example/private-repo', workflowRunId: 765,
    enqueuedAtMs: 86400000, attempts: 1,
  });
  try {
    await Promise.all([
      refs[0].set({...base(deliveryIds[0]),state:'queued'}),
      refs[1].set({...base(deliveryIds[1]),state:'dead',deadAtMs:12*86400000}),
      refs[2].set({...base(deliveryIds[2]),state:'completed',
        completedAtMs:8*86400000,retentionClass:'dedup_anchor_v1'}),
    ]);
    const stored = await Promise.all(refs.map(ref => ref.get()));
    assert.equal(stored.every(snapshot => snapshot.exists), true);
    const report = analyzeWebhookRetentionSnapshot(
      stored.map(snapshot => snapshot.data()),
      {nowMs,expectedDailyDeliveries:25,reviewBudgetJsonBytes:1},
    );
    assert.deepEqual(report.byState,{queued:1,processing:0,completed:1,dead:1});
    assert.equal(report.compactedCount,1);
    assert.equal(report.eligibleCompletedCount,0);
    assert.equal(report.thresholdExceeded,true);
    assert.equal(report.safePolicy.deleteDocuments,false);
    assert.equal(report.safePolicy.enableFirestoreTtl,false);
    assert.ok(report.predictedNewJsonBytesPerDay > 0);
    for (const id of deliveryIds) {
      assert.equal(JSON.stringify(report).includes(id),false);
    }
    assert.equal((await Promise.all(refs.map(ref => ref.get()))).every(s=>s.exists),true);
  } finally {
    await Promise.allSettled(refs.map(ref => ref.delete()));
    await closeAdmin(a);
  }
});


test('optional dual-anchor outbox retains GUID after synthetic work deletion across real Admin clients', async () => {
  assertLocalOnly();
  const a = newAdmin();
  const b = newAdmin();
  const c = newAdmin();
  const deliveryId = randomUUID();
  const signed = makeDelivery(deliveryId);
  const workRef = a.db.doc('githubWebhookOutbox/' + deliveryId);
  const anchorRef = a.db.doc('githubWebhookDedupAnchors/' + deliveryId);
  try {
    const callbacks = [
      createDualAnchorWebhookOutbox(a.db),
      createDualAnchorWebhookOutbox(b.db),
    ];
    const results = await Promise.all(Array.from({length:24}, (_, index) =>
      enqueueAuthorizedGitHubDelivery({
        ...CONFIG, ...signed, enqueueOnce:callbacks[index % 2],
      })));
    assert.equal(results.filter(x => x.status === 'enqueued').length, 1);
    assert.equal(results.filter(x => x.status === 'duplicate').length, 23);
    assert.equal((await workRef.get()).exists, true);
    const anchor = await anchorRef.get();
    assert.equal(anchor.exists, true);
    assert.deepEqual(anchor.data(), {
      kind:'github_workflow_delivery',
      recordedAtMs:anchor.data().recordedAtMs,
    });
    assert.ok(Number.isSafeInteger(anchor.data().recordedAtMs));
    // Delete only a synthetic emulator work doc. Anchor is never deleted in
    // production; the test proves its behavior after hypothetical expiry.
    await workRef.delete();
    assert.equal((await workRef.get()).exists, false);
    const replay = await enqueueAuthorizedGitHubDelivery({
      ...CONFIG, ...signed, enqueueOnce:createDualAnchorWebhookOutbox(c.db),
    });
    assert.equal(replay.status, 'duplicate');
    assert.equal((await workRef.get()).exists, false);
    assert.equal((await anchorRef.get()).exists, true);
  } finally {
    // Test-only cleanup of synthetic demo-emulator fixtures.
    await Promise.allSettled([workRef.delete(), anchorRef.delete()]);
    await Promise.all([closeAdmin(a), closeAdmin(b), closeAdmin(c)]);
  }
});

test('optional dual-anchor adapter refuses legacy outbox duplicates without automatic migration', async () => {
  assertLocalOnly();
  const a = newAdmin();
  const b = newAdmin();
  const deliveryId = randomUUID();
  const legacyRef = a.db.doc('githubWebhookOutbox/' + deliveryId);
  const anchorRef = a.db.doc('githubWebhookDedupAnchors/' + deliveryId);
  try {
    await legacyRef.set({state:'completed',deliveryId});
    const result = await createDualAnchorWebhookOutbox(b.db)({
      deliveryId, event:'workflow_run', action:'completed',
      installationId:11, repositoryId:42,
      repository:'example/private-repo', workflowRunId:765,
    });
    assert.equal(result,false);
    assert.equal((await anchorRef.get()).exists,false);
    assert.equal((await legacyRef.get()).exists,true);
  } finally {
    await Promise.allSettled([legacyRef.delete(),anchorRef.delete()]);
    await Promise.all([closeAdmin(a),closeAdmin(b)]);
  }
});

test('Firestore rules deny browser clients access to permanent GUID anchors', async () => {
  assertLocalOnly();
  const app = initializeClientApp({
    apiKey:'demo-emulator-only',
    authDomain:PROJECT_ID+'.firebaseapp.com',
    projectId:PROJECT_ID,
  },'anchor-client-'+randomUUID());
  try {
    const client = getClientFirestore(app);
    connectFirestoreEmulator(client,'127.0.0.1',8080);
    const ref = doc(client,'githubWebhookDedupAnchors',randomUUID());
    await assert.rejects(getDoc(ref),/permission|PERMISSION_DENIED/i);
    await assert.rejects(setDoc(ref,{kind:'github_workflow_delivery'}),/permission|PERMISSION_DENIED/i);
  } finally {
    await deleteClientApp(app);
  }
});
