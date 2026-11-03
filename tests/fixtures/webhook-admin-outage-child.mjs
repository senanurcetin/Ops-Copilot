import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createFirestoreWebhookOutbox } from '../../scripts/github-webhook-firestore-outbox.mjs';

const [mode, deliveryId] = process.argv.slice(2);
const project = 'demo-nexus-ops-isolation';
if (process.env.FIREBASE_PROJECT_ID !== project ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' ||
    !/^127\.0\.0\.1:[0-9]{1,5}$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '') ||
    process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080' ||
    !['warmup', 'blocked', 'replay'].includes(mode) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deliveryId ?? '')) {
  throw new Error('Refusing child Firestore test outside an isolated localhost proxy.');
}

const app = initializeApp({projectId: project}, 'webhook-outage-child');
const firestore = getFirestore(app);
const enqueueOnce = createFirestoreWebhookOutbox(firestore);
const work = {
  deliveryId, event: 'workflow_run', action: 'completed',
  installationId: 11, repositoryId: 42,
  repository: 'example/private-repo', workflowRunId: 765,
};

try {
  if (mode === 'blocked') {
    process.stdout.write('READY\n');
    await new Promise(resolve => process.stdin.once('data', resolve));
    process.stdout.write('ATTEMPTING\n');
    // The parent severs the *actual* proxy used by this Admin SDK client
    // before allowing this transaction. Parent will terminate this process
    // rather than wait for the SDK's long built-in transport retry deadlines.
  }
  const first = await enqueueOnce(work);
  process.stdout.write('FIRST:' + String(first) + '\n');
  if (mode === 'replay') {
    const second = await enqueueOnce(work);
    process.stdout.write('SECOND:' + String(second) + '\n');
  }
} finally {
  await firestore.terminate();
  await deleteApp(app);
}
