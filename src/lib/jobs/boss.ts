/**
 * pg-boss singleton.
 *
 * Why a singleton: pg-boss maintains its own Postgres connection pool
 * and polling loops. Spinning up multiple instances in the same
 * process would fragment those resources and multiply the polling
 * rate. Both the web process (which sends jobs) and the worker
 * process (which consumes them) get one each.
 *
 * Why lazy: importing this module shouldn't connect to Postgres —
 * integration tests may never touch it, and the build-time type-check
 * imports every module. The first `getBoss()` call starts the
 * instance; subsequent calls reuse it.
 *
 * Graceful shutdown: `stopBoss()` is exposed for the worker entry
 * point so SIGTERM cleanly drains in-flight jobs before the process
 * exits. Web processes ignore it — Next.js tears the Node runtime
 * down without giving us a hook anyway, and queue work isn't
 * initiated there.
 */
import { PgBoss } from "pg-boss";

import { env } from "@/lib/env";

let instance: PgBoss | null = null;
let startPromise: Promise<PgBoss> | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (instance) return instance;
  // Deduplicate concurrent first-time callers — otherwise two
  // request handlers racing on the first send would both call
  // `new PgBoss(...).start()` and end up with doubled pollers.
  if (startPromise) return startPromise;

  startPromise = (async () => {
    const boss = new PgBoss(env.DATABASE_URL);
    boss.on("error", (err: unknown) => {
      console.error("[pg-boss] error:", err);
    });
    await boss.start();
    instance = boss;
    return boss;
  })();

  return startPromise;
}

export async function stopBoss(): Promise<void> {
  if (!instance) return;
  await instance.stop({ graceful: true });
  instance = null;
  startPromise = null;
}
