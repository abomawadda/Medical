import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createAdminIdentityVerifier, legacyAdminState } from "../src/admin-identity.mjs";
import { createService } from "../src/core.mjs";
import { fixtureStore } from "./memory-store.mjs";

const secret = "test-only-legacy-binding-secret-1234567890";
const password = "test password with spaces ";
const salt = "synthetic-test-salt";
const hash = createHash("sha256").update(`${salt}::${password}`).digest("hex");
function fixture(overrides = {}) {
  const account = {
    id: "approved", name: "مدير اختبار", email: "admin@example.invalid",
    username: "test-admin", accountStatus: "active", role: "admin",
    passwordSalt: salt, passwordHash: hash, firebaseUid: "bound-uid", ...overrides,
  };
  let firebaseCalls = 0, reads = 0;
  const verify = createAdminIdentityVerifier({
    bindingSecret: secret,
    readApprovedAccounts: async () => { reads++; return [account]; },
    signInPassword: async () => { firebaseCalls++; throw new Error("Firebase password rejected"); },
    verifyToken: async (token) => {
      if (token !== "valid-token") throw new Error("Invalid token");
      return { uid: "bound-uid", accountId: "approved" };
    },
  });
  const source = {
    verifyAdminIdentity: verify,
    getLegacyAdminState: async (id) => id === "approved" ? legacyAdminState(account, secret) : null,
    findAccounts: async (uid) => uid === account.firebaseUid ? [{
      id: account.id, name: account.name, role: account.role,
      accountStatus: account.accountStatus, firebaseUid: account.firebaseUid,
    }] : [],
    getAccount: async () => account,
  };
  const store = fixtureStore({ records: [] });
  const service = createService({ source, store, secret, adminAccountIds: ["approved"] });
  return { account, verify, service, store, calls: () => ({ firebaseCalls, reads }) };
}
const login = (f, email = "admin@example.invalid", pass = password) =>
  f.service.adminLogin({ email, password: pass }, "fixture-ip");

test("legacy approved administrator signs in using the existing source password without calling Firebase Auth", async () => {
  for (const firebaseUid of ["bound-uid", ""]) {
    const f = fixture({ firebaseUid });
    const before = JSON.stringify(f.account);
    const result = await login(f, "  ADMIN@EXAMPLE.INVALID  ");
    assert.equal(result.user.role, "admin");
    assert.equal((await f.service.session(result.token)).role, "admin");
    assert.deepEqual(f.calls().firebaseCalls, 0);
    assert.equal(JSON.stringify(f.account), before);
    const persisted = JSON.stringify([...f.store.sessions.values()]);
    for (const value of [hash, salt, password, "passwordHash", "passwordSalt"])
      assert.ok(!persisted.includes(value));
    assert.ok(!JSON.stringify(result).includes("credentialBinding"));
  }
});

test("legacy username is accepted but wrong identifiers, passwords and malformed credentials fail", async () => {
  const f = fixture();
  assert.equal((await login(f, " TEST-ADMIN ")).user.role, "admin");
  for (const [email, pass] of [["other@example.invalid", password], ["admin@example.invalid", "wrong"],
    ["admin@example.invalid", password.trim()]]) {
    await assert.rejects(() => login(f, email, pass), (e) => e.code === "ADMIN_LOGIN_FAILED");
  }
  for (const passwordHash of ["", "bad", "a".repeat(63), "A".repeat(64)]) {
    const bad = fixture({ passwordHash });
    await assert.rejects(() => login(bad), (e) => e.code === "ADMIN_LOGIN_FAILED");
    assert.equal(bad.calls().firebaseCalls, 0);
  }
});

test("native Firebase authority never falls back to a valid old hash", async () => {
  for (const marker of [{ authMode: "firebase-native" }, { credentialAuthority: "firebase" },
    { registrationState: "pending_approval" }, { registrationState: "email_pending_verification" }]) {
    const f = fixture(marker);
    await assert.rejects(() => login(f), (e) => e.code === "ADMIN_LOGIN_FAILED");
    assert.equal(f.calls().firebaseCalls, 1);
    assert.equal(f.store.sessions.size, 0);
    assert.equal(legacyAdminState(f.account, secret), null);
  }
});

test("native authentication uses the approved source email and verifies the bound UID", async () => {
  for (const uid of ["bound-uid", "wrong-uid"]) {
    const f = fixture({ authMode: "firebase-native" });
    const verify = createAdminIdentityVerifier({
      bindingSecret: secret, readApprovedAccounts: async () => [f.account],
      signInPassword: async (email, pass) => {
        assert.equal(email, "admin@example.invalid"); assert.equal(pass, password); return "token";
      },
      verifyToken: async () => ({ uid }),
    });
    if (uid === "bound-uid") assert.equal((await verify({email:"TEST-ADMIN",password})).uid, uid);
    else await assert.rejects(() => verify({email:"TEST-ADMIN",password}));
  }
});

test("verified ID tokens remain supported and client method/role/account claims are ignored", async () => {
  const f = fixture();
  assert.equal((await f.service.adminLogin({id_token:"valid-token"}, "token-ip")).user.role, "admin");
  await assert.rejects(() => f.service.adminLogin({
    email:"admin@example.invalid", password:"wrong", method:"source-legacy", accountId:"approved", role:"admin",
  }, "forged"), (e) => e.code === "ADMIN_LOGIN_FAILED");
  await assert.rejects(() => f.verify({id_token:"forged-token"}));
});

test("password, UID, authority, role and account status changes invalidate legacy sessions", async () => {
  for (const change of [
    {passwordHash:"a".repeat(64)}, {passwordSalt:"new-salt"}, {firebaseUid:"new-uid"},
    {authMode:"firebase-native"}, {credentialAuthority:"firebase"}, {accountStatus:"suspended"},
    {role:"member"}, {email:"different@example.invalid"},
  ]) {
    const f = fixture();
    const token = (await login(f)).token;
    Object.assign(f.account, change);
    await assert.rejects(() => f.service.session(token), (e) => e.status === 403);
  }
});

test("inactive, non-admin and ambiguous approved accounts cannot authenticate", async () => {
  for (const change of [{accountStatus:"suspended"}, {role:"member"}]) {
    const f = fixture(change);
    await assert.rejects(() => login(f), (e) => e.code === "ADMIN_LOGIN_FAILED");
    assert.equal(f.store.sessions.size, 0);
  }
  const f = fixture();
  const verify = createAdminIdentityVerifier({
    bindingSecret: secret, readApprovedAccounts: async () => [f.account, {...f.account,id:"another"}],
  });
  await assert.rejects(() => verify({email:"admin@example.invalid",password}));
});

test("distributed password guessing is limited across source IPs", async () => {
  const f = fixture();
  for (let i=0;i<12;i++) await assert.rejects(
    () => f.service.adminLogin({email:"admin@example.invalid",password:"wrong"}, "ip-"+i),
    (e) => e.code === "ADMIN_LOGIN_FAILED",
  );
  await assert.rejects(() => f.service.adminLogin({email:"admin@example.invalid",password}, "another-ip"),
    (e) => e.status === 429);
});
