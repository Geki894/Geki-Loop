#!/usr/bin/env node
import { runCli } from "../src/cli.mjs";

runCli(process.argv.slice(2)).catch((error) => {
  console.error(`Geki failed: ${error.message}`);
  if (process.env.GEKI_DEBUG === "1") console.error(error.stack);
  process.exitCode = 1;
});
