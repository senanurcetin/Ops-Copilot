import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer, connect} from 'node:net';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {initializeApp, deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {performance} from 'node:perf_hooks';
import {formatSyntheticRecoveryEvidence} from '../scripts/github-webhook-recovery-evidence.mjs';
import {createFirestoreWebhookOutbox} from '../scripts/github-webhook-firestore-outbox.mjs';

const execFileAsync = promisify(execFile);
const project = 'demo-nexus-ops-isolation';
const fixturePath = fileURLToPath(new URL('./fixtures/webhook-admin-outage-child.mjs', import.meta.url));

function assertLocalOnly() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' ||
      process.env.FIREBASE_PROJECT_ID !== project) {
    throw new Error('Refusing Admin SDK disconnection test outside demo localhost Firebase emulators.');
  }
}

test('real Admin SDK through isolated TCP proxy: disconnect, process loss, fresh-client replay', {
  timeout: 45000,
}, async () => {
  assertLocalOnly();
  const sockets = new Set();
  let online = true;
  const server = createServer(client => {
    sockets.add(client);
    client.on('error', () => {});
    client.on('close', () => sockets.delete(client));
    if (!online) { client.destroy(); return; }
    const upstream = connect(8080, '127.0.0.1');
    sockets.add(upstream);
    upstream.on('error', () => client.destroy());
    upstream.on('close', () => { sockets.delete(upstream); client.destroy(); });
    client.on('close', () => upstream.destroy());
    client.pipe(upstream).pipe(client);
  });
  const warmupId = randomUUID();
  const interruptedId = randomUUID();
  const app = initializeApp({projectId: project}, 'outage-controller-' + randomUUID());
  const admin = getFirestore(app);
  let blocked = null;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const childEnv = {
      ...process.env,
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:' + address.port,
      FIREBASE_PROJECT_ID: project, GCLOUD_PROJECT: project,
    };

    const warmup = await execFileAsync(
      process.execPath, [fixturePath, 'warmup', warmupId],
      {env: childEnv, timeout: 20000, maxBuffer: 4096},
    );
    assert.match(warmup.stdout, /FIRST:true/);
    assert.equal((await admin.doc('githubWebhookOutbox/' + warmupId).get()).exists, true);

    blocked = spawn(process.execPath, [fixturePath, 'blocked', interruptedId], {
      env: childEnv, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    blocked.stdout.setEncoding('utf8');
    blocked.stdout.on('data', data => {output += data;});
    const awaitMarker = (marker, timeoutMs = 8000) => new Promise((resolve, reject) => {
      if (output.includes(marker)) return resolve();
      const expiry = setTimeout(() => {
        blocked.stdout.off('data', observe);
        reject(new Error('Timed out waiting for child test marker.'));
      }, timeoutMs);
      function observe() {
        if (output.includes(marker)) {
          clearTimeout(expiry);
          blocked.stdout.off('data', observe);
          resolve();
        }
      }
      blocked.stdout.on('data', observe);
    });
    await awaitMarker('READY\n');
    online = false;
    for (const socket of sockets) socket.destroy();
    blocked.stdin.write('GO\n');
    await awaitMarker('ATTEMPTING\n');
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(output.includes('FIRST:'), false, 'Disconnected client must not acknowledge a write');
    blocked.kill('SIGKILL');
    await new Promise(resolve => blocked.once('close', resolve));
    blocked = null;

    online = true;
    const verificationStartMs = performance.now();
    const afterRestart = await execFileAsync(
      process.execPath, [fixturePath, 'replay', interruptedId],
      {env: childEnv, timeout: 20000, maxBuffer: 4096},
    );
    // The interrupted transaction could have committed before its ACK was
    // lost. Recovery must treat either possible first outcome as safe.
    assert.match(afterRestart.stdout, /FIRST:(true|false)/);
    assert.match(afterRestart.stdout, /SECOND:false/);
    const persisted = await admin.doc('githubWebhookOutbox/' + interruptedId).get();
    assert.equal(persisted.exists, true);
    assert.equal(persisted.data().deliveryId, interruptedId);
    assert.equal(persisted.data().workflowRunId, 765);
    assert.equal(await createFirestoreWebhookOutbox(admin)({
      deliveryId: interruptedId, event: 'workflow_run', action: 'completed',
      installationId: 11, repositoryId: 42,
      repository: 'example/private-repo', workflowRunId: 765,
    }), false);
    // One monotonic localhost recovery measurement, measured AFTER the
    // proxy is online through durable-state and duplicate-replay assertions.
    // This is NOT production RTO, RPO or a staged deployment rollback.
    const replayVerificationMs = Math.ceil(performance.now() - verificationStartMs);
    const evidence = formatSyntheticRecoveryEvidence({
      replayVerificationMs,
      disconnectedWriteUnacknowledged: true,
      durableWorkVerified: true,
      duplicateReplayRejected: true,
    });
    process.stdout.write('SYNTHETIC_RECOVERY_EVIDENCE ' + JSON.stringify(evidence) + '\n');
  } finally {
    if (blocked) {
      blocked.kill('SIGKILL');
      await new Promise(resolve => {
        if (blocked.exitCode !== null || blocked.signalCode !== null) resolve();
        else blocked.once('close', resolve);
      });
    }
    online = false;
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(() => resolve()));
    await admin.doc('githubWebhookOutbox/' + warmupId).delete();
    await admin.doc('githubWebhookOutbox/' + interruptedId).delete();
    await admin.terminate();
    await deleteApp(app);
  }
});
