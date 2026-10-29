const SensitiveNames = new Set([
  "authorization",
  "cookie",
  "setcookie",
  "password",
  "secret",
  "token",
  "credential",
  "apikey",
  "email",
  "phone",
  "onetimecode",
  "onetimepassword",
  "emailcode",
  "verificationcode",
  "otp",
  "firstname",
  "lastname",
  "fullname",
  "name",
  "dateofbirth",
  "birthdate",
  "address",
  "passport",
  "passportnumber",
  "document",
  "documentnumber",
  "identitydocument",
  "passengers",
  "cardnumber",
  "creditcardnumber",
  "cvv",
  "cvc",
  "iban",
  "accountnumber",
  "taxid",
  "nationalid",
  "userid",
  "customerid",
  "memberid",
])

const Redacted = "[REDACTED]"

function redactText(value: string): string {
  return value
    .replace(/(\w+:\/\/)[^/@\s]+:[^/@\s]+@/g, `$1${Redacted}@`)
    .replace(/\bBearer\s+[^\s,;]+/gi, `Bearer ${Redacted}`)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, Redacted)
    .replace(/\b(password|token|secret|api[_-]?key)=([^\s&]+)/gi, `$1=${Redacted}`)
}

export function redact(value: unknown): unknown {
  if (typeof value === "string") return redactText(value)
  if (Array.isArray(value)) return value.map(redact)
  if (!value || typeof value !== "object") return value

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, isSensitiveKey(key) ? Redacted : redact(item)]))
}

function isSensitiveKey(key: string) {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase()

  return SensitiveNames.has(normalized) || /(?:token|secret|password|credential|apikey|email|phone)$/.test(normalized)
}
