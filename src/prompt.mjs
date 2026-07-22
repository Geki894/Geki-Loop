import readline from "node:readline";

export async function confirm(message, defaultValue = true) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return defaultValue;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? " [Y/n] " : " [y/N] ";
  return new Promise((resolve) => rl.question(message + suffix, (answer) => {
    rl.close();
    const normalized = answer.trim().toLowerCase();
    resolve(normalized ? normalized === "y" || normalized === "yes" : defaultValue);
  }));
}

export async function checkbox(message, choices) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return choices.filter((choice) => choice.checked).map((choice) => choice.value);
  }
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  let cursor = 0;
  const selected = new Set(choices.filter((choice) => choice.checked).map((choice) => choice.value));
  const lines = choices.length + 3;
  function render(first = false) {
    if (!first) process.stdout.write(`\x1b[${lines}A`);
    process.stdout.write(`${message}\x1b[K\n`);
    choices.forEach((choice, index) => {
      const pointer = index === cursor ? ">" : " ";
      const mark = selected.has(choice.value) ? "◉" : "◯";
      process.stdout.write(`${pointer} ${mark} ${choice.label}\x1b[K\n`);
    });
    process.stdout.write("Space: toggle    Enter: continue\x1b[K\n\x1b[K\n");
  }
  render(true);
  return new Promise((resolve, reject) => {
    function done(error) {
      process.stdin.off("keypress", onKey);
      process.stdin.setRawMode(false);
      process.stdout.write("\x1b[?25h");
      if (error) reject(error); else resolve([...selected]);
    }
    function onKey(_str, key) {
      if (key.ctrl && key.name === "c") return done(new Error("Selection cancelled"));
      if (key.name === "up") cursor = (cursor - 1 + choices.length) % choices.length;
      else if (key.name === "down") cursor = (cursor + 1) % choices.length;
      else if (key.name === "space") {
        const value = choices[cursor].value;
        if (selected.has(value)) selected.delete(value); else selected.add(value);
      } else if (key.name === "return") return done();
      render();
    }
    process.stdout.write("\x1b[?25l");
    process.stdin.on("keypress", onKey);
  });
}
