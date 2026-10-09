import {
  BoundedIO,
  retainCustody,
} from "../supabase/functions/_shared/qa-context.ts";
Deno.test("I/O receipt distinguishes failed SDK response from physical fulfillment", async () => {
  const io = new BoundedIO({ stageMs: 20 });
  await io.run("provider", () => ({ error: { status: 500 }, data: null }));
  const r = io.snapshot().stages[0];
  if (r.state !== "failed" || r.actual !== "fulfilled") {
    throw Error("API failure is not completed success");
  }
});
Deno.test("deadline receipt remains timed out after later physical fulfillment", async () => {
  const io = new BoundedIO({ stageMs: 10 });
  let release!: (v: number) => void;
  const held = new Promise<number>((r) => release = r),
    step = io.start("sql", () => held);
  if (io.snapshot().stages[0].state !== "started") {
    throw Error("missing started state");
  }
  await step.bounded.catch(() => {});
  const before = io.snapshot();
  if (
    before.unsettled !== 1 || before.stages[0].state !== "timed_out" ||
    before.stages[0].actual !== "pending"
  ) throw Error("deadline pretends cancellation");
  release(1);
  await step.actual;
  await io.drain();
  const after = io.snapshot();
  if (
    after.unsettled !== 0 || after.stages[0].state !== "timed_out" ||
    after.stages[0].actual !== "fulfilled"
  ) throw Error("late settlement lost its timeout history");
});
Deno.test("private custody registers actual settlement with EdgeRuntime waitUntil", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "EdgeRuntime");
  const registered: Promise<unknown>[] = [];
  let release!: () => void;
  let settled = false;
  Object.defineProperty(globalThis, "EdgeRuntime", {
    value: { waitUntil: (p: Promise<unknown>) => registered.push(p) },
    configurable: true,
  });
  try {
    const actual = new Promise<void>((r) => release = r);
    retainCustody(actual);
    if (registered.length !== 1) {
      throw Error("actual custody not registered with Edge runtime");
    }
    void registered[0].then(() => {
      settled = true;
    });
    await Promise.resolve();
    if (settled) throw Error("runtime custody prematurely settled");
    release();
    await registered[0];
    if (!settled) throw Error("runtime settlement missing");
  } finally {
    release();
    if (previous) Object.defineProperty(globalThis, "EdgeRuntime", previous);
    else Reflect.deleteProperty(globalThis, "EdgeRuntime");
  }
});
Deno.test("success rejection and invalid deadline receipts are nonsecret", async () => {
  const io = new BoundedIO({ stageMs: 20 });
  await io.run("auth", () => 1);
  await io.run(
    "auth",
    () => Promise.reject(new Error(["private", "candidate"].join("-"))),
  ).catch(() => {});
  const state = io.snapshot();
  if (
    state.stages[0].state !== "completed" ||
    state.stages[1].state !== "failed" ||
    state.stages[1].actual !== "rejected" ||
    JSON.stringify(state).includes("private-candidate")
  ) throw Error("receipt state or sanitization lost");
  for (const n of [0, NaN, Infinity, 60001]) {
    let denied = false;
    try {
      new BoundedIO({ stageMs: n });
    } catch {
      denied = true;
    }
    if (!denied) throw Error("nonfinite/unbounded deadline accepted");
  }
});
