import { describe, expect, it } from "vitest";

import { MIN_PASSWORD_LENGTH, validatePassword } from "../password-policy";

describe("validatePassword", () => {
  it("accepts a long, diverse password", () => {
    expect(validatePassword("ThisIsALongPass9!@#")).toEqual({ ok: true });
  });

  it("rejects passwords shorter than the minimum", () => {
    const short = "Aa9!aa".padEnd(MIN_PASSWORD_LENGTH - 1, "x");
    expect(validatePassword(short)).toEqual({ ok: false, reason: "too_short" });
  });

  it("rejects passwords missing a lowercase letter", () => {
    expect(validatePassword("ALL-UPPER-9999-!!")).toEqual({
      ok: false,
      reason: "missing_lower",
    });
  });

  it("rejects passwords missing an uppercase letter", () => {
    expect(validatePassword("all-lower-9999-!!")).toEqual({
      ok: false,
      reason: "missing_upper",
    });
  });

  it("rejects passwords missing a digit", () => {
    expect(validatePassword("NoDigitsHere!@#!@#")).toEqual({
      ok: false,
      reason: "missing_digit",
    });
  });

  it("rejects passwords missing a symbol", () => {
    expect(validatePassword("NoSymbols123abcdef")).toEqual({
      ok: false,
      reason: "missing_symbol",
    });
  });

  it("rejects common passwords that would otherwise pass complexity", () => {
    // Case-insensitive lookup against the embedded top list.
    expect(validatePassword("Passw0rd123!")).toEqual({ ok: false, reason: "too_common" });
    expect(validatePassword("Welcome1234!")).toEqual({ ok: false, reason: "too_common" });
  });

  it("reports the first failing rule (length beats everything)", () => {
    // 11 chars, symbol missing — both checks fail, but length is checked first.
    expect(validatePassword("Abcdefg123")).toEqual({ ok: false, reason: "too_short" });
  });
});
