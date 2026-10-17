import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const normalized = (value) => String(value || "").trim().toLowerCase();
const denied = () => { throw new Error("Admin sign-in rejected"); };

// Mirror the source application's authority selection. Native Firebase accounts
// must never fall back to a stale legacy password hash after a Firebase failure.
export function usesLegacyPassword(account) {
  return Boolean(
    account &&
    account.authMode !== "firebase-native" &&
    account.credentialAuthority !== "firebase" &&
    !["email_pending_verification", "pending_approval"].includes(account.registrationState) &&
    !(account.firebaseUid && account.email && !account.passwordSalt) &&
    (account.passwordHash || account.passwordSalt),
  );
}

export function legacyAdminState(account, bindingSecret) {
  if (!usesLegacyPassword(account) || !bindingSecret || bindingSecret.length < 32 ||
      typeof account.passwordSalt !== "string" || !account.passwordSalt || account.passwordSalt.length > 1024 ||
      typeof account.passwordHash !== "string" || !/^[a-f0-9]{64}$/.test(account.passwordHash)) return null;
  return {
    id: account.id,
    name: account.name,
    role: account.role,
    accountStatus: account.accountStatus,
    firebaseUid: account.firebaseUid || "",
    // This keyed binding is not a password verifier. Raw source hashes/salts are
    // never returned to the core, copied to Medical, or sent to the browser.
    credentialBinding: createHmac("sha256", bindingSecret).update(JSON.stringify([
      account.id, account.firebaseUid || "", normalized(account.email),
      normalized(account.username), account.authMode || "", account.credentialAuthority || "",
      account.registrationState || "", account.passwordSalt, account.passwordHash,
    ])).digest("hex"),
  };
}

export function createAdminIdentityVerifier({ readApprovedAccounts, verifyToken, signInPassword, bindingSecret }) {
  return async (body) => {
    if (body.id_token) {
      const decoded = await verifyToken(body.id_token);
      return { uid: decoded.uid, accountId: decoded.accountId || "", method: "firebase" };
    }
    if (typeof body.email !== "string" || !body.email.trim() || body.email.length > 254 ||
        typeof body.password !== "string" || !body.password || body.password.length > 256) denied();
    const identifier = normalized(body.email);
    const matches = (await readApprovedAccounts()).filter((a) =>
      [a.email, a.username].some((value) => value && normalized(value) === identifier),
    );
    if (matches.length !== 1) denied();
    const account = matches[0];
    if (account.role !== "admin" || account.accountStatus !== "active") denied();
    if (usesLegacyPassword(account)) {
      const state = legacyAdminState(account, bindingSecret);
      if (!state) denied();
      const actual = createHash("sha256").update(`${account.passwordSalt}::${body.password}`).digest();
      const expected = Buffer.from(account.passwordHash, "hex");
      if (!timingSafeEqual(actual, expected)) denied();
      return {
        method: "source-legacy", accountId: account.id,
        uid: state.firebaseUid, credentialBinding: state.credentialBinding,
      };
    }
    if (!account.email || !account.firebaseUid) denied();
    const token = await signInPassword(String(account.email).trim(), body.password);
    const decoded = await verifyToken(token);
    if (decoded.uid !== account.firebaseUid || (decoded.accountId && decoded.accountId !== account.id)) denied();
    return { uid: decoded.uid, accountId: account.id, method: "firebase" };
  };
}
