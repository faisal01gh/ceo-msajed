// TEST ONLY. Parent runs one exact named case per process/fresh owned database.
// No fixture imports here: synthetic transport-only tests remain database-free.
const selectedEdgeCase = Deno.env.get("QA_EDGE_TEST_CASE");
const registeredEdgeCases = new Set<string>();
let selectedEdgeCaseCount = 0;

export function edgeTest(name: string, run: () => Promise<void>) {
  if (registeredEdgeCases.has(name)) {
    throw new Error("duplicate Edge fixture test name: " + name);
  }
  registeredEdgeCases.add(name);
  if (selectedEdgeCase !== undefined && name !== selectedEdgeCase) return;
  selectedEdgeCaseCount++;
  Deno.test(name, run);
}

// Call once after all registrations in the selected source file. An empty,
// misspelled or foreign selector is an error, never a successful zero-test run.
export function finishEdgeTests() {
  if (registeredEdgeCases.size === 0) {
    throw new Error("Edge fixture source has no named tests");
  }
  if (selectedEdgeCase !== undefined && selectedEdgeCaseCount !== 1) {
    throw new Error("QA_EDGE_TEST_CASE does not name a test in this source");
  }
}
