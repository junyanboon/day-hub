// Waits for a test's fake backend (calendar-dev.mjs or a copy) to say it is listening. If it dies first (the usual
// reason: "address already in use"), the test fails at once with that said, instead of waiting for a line that never comes.
export function serverReady(child, what = "dev server") {
  return new Promise((ok, fail) => {
    child.stdout.once("data", ok);
    child.once("exit", (code, signal) => fail(new Error(`${what} ended (${signal || "code " + code}) before it was listening: is its port already in use?`)));
  });
}
