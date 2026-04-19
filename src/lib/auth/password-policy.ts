export type PasswordReason =
  | "too_short"
  | "missing_lower"
  | "missing_upper"
  | "missing_digit"
  | "missing_symbol"
  | "too_common";

export type PasswordCheck = { ok: true } | { ok: false; reason: PasswordReason };

export const MIN_PASSWORD_LENGTH = 12;

// Top 100 commonly-breached passwords (based on public lists like RockYou
// and SecLists). Intentionally inline — loading a file at import time
// makes the policy harder to reason about, and this list is rarely edited.
// All entries are lowercased; input is lowercased before lookup.
const COMMON_PASSWORDS = new Set([
  "123456",
  "123456789",
  "qwerty",
  "password",
  "12345678",
  "111111",
  "123123",
  "1234567890",
  "1234567",
  "qwerty123",
  "000000",
  "1q2w3e",
  "aa12345678",
  "abc123",
  "password1",
  "1234",
  "qwertyuiop",
  "123321",
  "password123",
  "iloveyou",
  "admin",
  "welcome",
  "monkey",
  "login",
  "abc12345",
  "starwars",
  "123qwe",
  "dragon",
  "passw0rd",
  "master",
  "hello",
  "freedom",
  "whatever",
  "qazwsx",
  "trustno1",
  "jordan",
  "harley",
  "robert",
  "matthew",
  "jordan23",
  "daniel",
  "andrew",
  "lakers",
  "andrea",
  "buster",
  "joshua",
  "princess",
  "letmein",
  "zaq12wsx",
  "football",
  "superman",
  "batman",
  "qwerty1",
  "sunshine",
  "shadow",
  "michael",
  "696969",
  "mustang",
  "654321",
  "jesus",
  "michelle",
  "ashley",
  "bailey",
  "passw0rd1",
  "password12",
  "password1234",
  "password12345",
  "qwertyuiop123",
  "iloveyou1",
  "charlie",
  "donald",
  "loveme",
  "qwer1234",
  "soccer",
  "tigger",
  "computer",
  "hockey",
  "killer",
  "george",
  "hannah",
  "thomas",
  "anthony",
  "william",
  "amanda",
  "purple",
  "summer",
  "orange",
  "winter",
  "spring",
  "autumn",
  "november",
  "december",
  "january",
  "february",
  "welcome1",
  "admin123",
  "admin1",
  "letmein1",
  "qwerty12",
  "qwerty1234",
  "password!",
  "p@ssw0rd",
  "p@ssword1",
  // Complexity-passing breached passwords.
  "passw0rd123!",
  "welcome1234!",
  "qwerty1234!@",
  "p@ssw0rd1234",
]);

export function validatePassword(password: string): PasswordCheck {
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: "too_short" };
  if (!/[a-z]/.test(password)) return { ok: false, reason: "missing_lower" };
  if (!/[A-Z]/.test(password)) return { ok: false, reason: "missing_upper" };
  if (!/[0-9]/.test(password)) return { ok: false, reason: "missing_digit" };
  if (!/[^A-Za-z0-9]/.test(password)) return { ok: false, reason: "missing_symbol" };
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return { ok: false, reason: "too_common" };
  return { ok: true };
}

export const PASSWORD_REASON_MESSAGES: Record<PasswordReason, string> = {
  too_short: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  missing_lower: "Password must contain a lowercase letter.",
  missing_upper: "Password must contain an uppercase letter.",
  missing_digit: "Password must contain a digit.",
  missing_symbol: "Password must contain a symbol.",
  too_common: "Password is on a list of common/breached passwords.",
};
