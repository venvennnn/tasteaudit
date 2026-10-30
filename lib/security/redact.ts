const SECRET_ENV = ["QLOO_API_KEY", "GEMINI_API_KEY", "EVIDENCE_SIGNING_SECRET"] as const;

export function redactSecrets(value: string): string {
  let output = value;
  for (const name of SECRET_ENV) {
    const secret = process.env[name];
    if (secret && secret.length >= 4) {
      output = output.split(secret).join("[redacted]");
    }
  }
  output = output.replace(/AIza[0-9A-Za-z\-_]{10,}/g, "[redacted]");
  output = output.replace(/(X-Api-Key["']?\s*[:=]\s*["']?)[^"'\s]+/gi, "$1[redacted]");
  output = output.replace(/(api[_-]?key["']?\s*[:=]\s*["']?)[^"'\s]+/gi, "$1[redacted]");
  return output;
}
