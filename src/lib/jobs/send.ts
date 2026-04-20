/**
 * Typed `send` wrapper. Callers use `sendJob(QUEUES.intakeOcr, { ... })`
 * and both the queue name and the payload shape are type-checked.
 *
 * pg-boss requires queues to exist before jobs can be created on
 * them. `createQueue` is idempotent, so we call it once per process
 * the first time a queue is sent to — cheap and avoids a separate
 * provisioning step.
 */
import { getBoss } from "./boss";
import { PAYLOAD_SCHEMAS, type QueueName } from "./queues";

type PayloadOf<Q extends QueueName> = (typeof PAYLOAD_SCHEMAS)[Q] extends {
  parse: (input: unknown) => infer T;
}
  ? T
  : never;

const provisioned = new Set<QueueName>();

export async function sendJob<Q extends QueueName>(queue: Q, data: PayloadOf<Q>): Promise<string> {
  const boss = await getBoss();
  // Validate on send so a caller misusing the payload fails here,
  // not in the worker after the job is already queued.
  PAYLOAD_SCHEMAS[queue].parse(data);

  if (!provisioned.has(queue)) {
    await boss.createQueue(queue);
    provisioned.add(queue);
  }

  const id = await boss.send(queue, data as object);
  if (!id) {
    // pg-boss returns null when a singleton queue already has an
    // active job and the dedupe rule fired. None of our queues use
    // that policy today, so treat it as a bug.
    throw new Error(`pg-boss send returned null for queue ${queue}`);
  }
  return id;
}
