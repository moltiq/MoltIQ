import { describe, it, expect, beforeEach } from "vitest";
import { redact, redactObject, setRedactionDenylist } from "./redaction.js";

describe("redaction", () => {
  beforeEach(() => {
    setRedactionDenylist([]);
  });

  it("redacts API key patterns", () => {
    expect(redact("api_key=sk_live_abc123def456ghi789")).toContain("[REDACTED_KEY]");
    expect(redact("apikey = \"sk-xyz789\"")).toContain("[REDACTED_KEY]");
  });

  it("redacts Bearer tokens", () => {
    expect(redact("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxx")).toContain("[REDACTED]");
  });

  it("redacts long hex blobs", () => {
    const hex = "0x" + "a".repeat(64);
    expect(redact(hex)).toBe("[REDACTED_WALLET]");
  });

  it("redacts PEM blocks", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----";
    expect(redact(pem)).toContain("[REDACTED_PEM]");
  });

  it("leaves short safe text unchanged", () => {
    expect(redact("hello world")).toBe("hello world");
    expect(redact("")).toBe("");
  });

  it("redactObject redacts string fields recursively", () => {
    const obj = {
      title: "Note",
      secret: "api_key=sk_secret_12345678901234567890",
      nested: { token: "Bearer abcdefghijklmnopqrstuvwxyz" },
    };
    const out = redactObject(obj);
    expect(out.title).toBe("Note");
    expect(out.secret).toContain("[REDACTED_KEY]");
    expect((out.nested as { token: string }).token).toContain("[REDACTED]");
  });
});
