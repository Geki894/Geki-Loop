export function parseArgs(argv) {
  const result = { command: "help", positional: [], flags: {} };
  if (argv.length && !argv[0].startsWith("-")) result.command = argv.shift();
  while (argv.length) {
    const token = argv.shift();
    if (!token.startsWith("--")) {
      result.positional.push(token);
      continue;
    }
    const [rawKey, inline] = token.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (inline !== undefined) result.flags[key] = inline;
    else if (argv.length && !argv[0].startsWith("--")) result.flags[key] = argv.shift();
    else result.flags[key] = true;
  }
  return result;
}

export function csv(value, fallback = []) {
  if (!value) return fallback;
  return String(value).split(",").map((part) => part.trim()).filter(Boolean);
}
