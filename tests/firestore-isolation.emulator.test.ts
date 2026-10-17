import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously, signOut } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';

// Explicitly opt in to an entirely local emulator test: avoid accidental
// writes to real projects even if a developer's Firebase CLI is authenticated.
const projectId = 'demo-nexus-ops-isolation';
function assertLocalEmulators() {
  const auth = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const firestore = process.env.FIRESTORE_EMULATOR_HOST;
  if (auth !== '127.0.0.1:9099' || firestore !== '127.0.0.1:8080') {
    throw new Error('Refusing integration test without local Firebase Auth 9099 AND Firestore 8080 emulators.');
  }
  if (process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_PROJECT_ID !== projectId) {
    throw new Error('Refusing integration test with a non-demo FIREBASE_PROJECT_ID.');
  }
}

test('authenticated Alice/Bob Firestore rules enforce tenant isolation', async () => {
  assertLocalEmulators();
  const apps = [
    initializeApp({ apiKey: 'demo-emulator-only', authDomain: projectId + '.firebaseapp.com', projectId }, 'alice-isolation-test'),
    initializeApp({ apiKey: 'demo-emulator-only', authDomain: projectId + '.firebaseapp.com', projectId }, 'bob-isolation-test'),
  ];
  try {
    const [aliceApp, bobApp] = apps;
    const aliceAuth = getAuth(aliceApp);
    const bobAuth = getAuth(bobApp);
    connectAuthEmulator(aliceAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectAuthEmulator(bobAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const aliceUser = (await signInAnonymously(aliceAuth)).user;
    const bobUser = (await signInAnonymously(bobAuth)).user;
    assert.notEqual(aliceUser.uid, bobUser.uid, 'emulator must create separate authenticated users');

    const aliceDb = getFirestore(aliceApp);
    const bobDb = getFirestore(bobApp);
    connectFirestoreEmulator(aliceDb, '127.0.0.1', 8080);
    connectFirestoreEmulator(bobDb, '127.0.0.1', 8080);

    const aliceProfile = doc(aliceDb, 'users', aliceUser.uid);
    const bobReadingAlice = doc(bobDb, 'users', aliceUser.uid);
    const bobProfile = doc(bobDb, 'users', bobUser.uid);
    const aliceMessage = doc(aliceDb, 'users', aliceUser.uid, 'messages', 'emulator-test');
    const bobReadingMessage = doc(bobDb, 'users', aliceUser.uid, 'messages', 'emulator-test');
    await setDoc(aliceProfile, { displayName: 'Alice (emulator fixture)' });
    await setDoc(bobProfile, { displayName: 'Bob (emulator fixture)' });
    await setDoc(aliceMessage, { text: 'private emulator fixture' });
    assert.equal((await getDoc(aliceProfile)).data()?.displayName, 'Alice (emulator fixture)');
    assert.equal((await getDoc(bobProfile)).data()?.displayName, 'Bob (emulator fixture)');
    assert.equal((await getDoc(aliceMessage)).data()?.text, 'private emulator fixture');

    // Even a valid signed-in Bob session cannot access Alice's private state.
    await assert.rejects(getDoc(bobReadingAlice), /permission|PERMISSION_DENIED/i);
    await assert.rejects(setDoc(bobReadingAlice, { displayName: 'overwritten' }), /permission|PERMISSION_DENIED/i);
    await assert.rejects(getDoc(bobReadingMessage), /permission|PERMISSION_DENIED/i);
    await assert.rejects(setDoc(bobReadingMessage, { text: 'forged' }), /permission|PERMISSION_DENIED/i);

    // Admin-only knowledge and checklist logs have no direct browser grants.
    for (const collection of ['knowledgeDocuments', 'checklistLogs']) {
      const alicePrivate = doc(aliceDb, 'users', aliceUser.uid, collection, 'emulator-test');
      const bobPrivate = doc(bobDb, 'users', bobUser.uid, collection, 'emulator-test');
      await assert.rejects(getDoc(alicePrivate), /permission|PERMISSION_DENIED/i);
      await assert.rejects(setDoc(alicePrivate, { data: 'forbidden client write' }), /permission|PERMISSION_DENIED/i);
      await assert.rejects(getDoc(bobPrivate), /permission|PERMISSION_DENIED/i);
    }

    await deleteDoc(aliceMessage);
    await deleteDoc(aliceProfile);
    await deleteDoc(bobProfile);
    await signOut(aliceAuth);
    await signOut(bobAuth);
  } finally {
    await Promise.all(apps.map(app => deleteApp(app)));
  }
});
