import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, passwordValidationError, verifyPassword } from "../src/lib/password";

test("mật khẩu phải có đủ các nhóm ký tự", () => {
  assert.ok(passwordValidationError("Ab1!"));
  assert.ok(passwordValidationError("abcdefgh1!"));
  assert.ok(passwordValidationError("ABCDEFGH1!"));
  assert.ok(passwordValidationError("Abcdefgh!"));
  assert.ok(passwordValidationError("Abcdefgh1"));
  assert.equal(passwordValidationError("Abcdef1!"), null);
});

test("hash mới xác minh đúng và không lưu mật khẩu thô", async () => {
  const password = "Abcdef1!";
  const hash = await hashPassword(password);
  assert.match(hash, /^pbkdf2\$100000\$/);
  assert.equal(hash.includes(password), false);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword("Wrong1!", hash), false);
});

test("vẫn xác minh được hash PBKDF2 cũ", async () => {
  const password = "legacy";
  const salt = new Uint8Array(16);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 80_000, hash: "SHA-256" },
    key,
    256,
  );
  const hex = (value: Uint8Array) => [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  assert.equal(await verifyPassword(password, `pbkdf2$80000$${hex(salt)}$${hex(new Uint8Array(bits))}`), true);
});
