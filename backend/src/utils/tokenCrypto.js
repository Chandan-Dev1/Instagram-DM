import crypto from "crypto";

const algorithm = "aes-256-gcm";

function getKey() {
  const rawKey = process.env.TOKEN_ENCRYPTION_KEY;

  // Local development can run without encryption, but production should set a key.
  if (!rawKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("TOKEN_ENCRYPTION_KEY is required in production");
    }
    return null;
  }

  if (!/^[a-fA-F0-9]{64}$/.test(rawKey)) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be exactly 64 hexadecimal characters");
  }

  return Buffer.from(rawKey, "hex");
}

export function encryptToken(plainText) {
  const key = getKey();
  if (!key) return { value: plainText, encrypted: false };

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return {
    value: `${iv.toString("hex")}.${tag.toString("hex")}.${encrypted.toString("hex")}`,
    encrypted: true
  };
}

export function decryptToken(storedValue, encrypted) {
  if (!encrypted) return storedValue;

  const key = getKey();
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is required to decrypt this token");

  const [ivHex, tagHex, dataHex] = storedValue.split(".");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Stored Instagram token has an invalid encrypted format");
  }

  const decipher = crypto.createDecipheriv(
    algorithm,
    key,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final()
  ]).toString("utf8");
}
