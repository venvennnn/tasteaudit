const FORMULA = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "string" ? value : String(value);
  if (FORMULA.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map((header) => escapeCsvCell(header)).join(",")];
  for (const row of rows) lines.push(row.map((cell) => escapeCsvCell(cell)).join(","));
  return `${lines.join("\r\n")}\r\n`;
}
