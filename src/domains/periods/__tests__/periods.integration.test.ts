import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { createEntity } from "@/domains/entities";
import { ConflictError, NotFoundError, ValidationError } from "@/domains/errors";
import { createPeriod, lockPeriod, unlockPeriod } from "@/domains/periods";
import { assertPeriodUnlocked, PeriodLockedError } from "@/lib/versioning";

import { makeTestHarness, truncateAll, type TestHarness } from "../../__tests__/test-utils";

let h: TestHarness;

beforeAll(async () => {
  h = await makeTestHarness();
});

afterAll(async () => {
  await h.client.end();
});

beforeEach(async () => {
  await truncateAll(h.db);
  await h.seedAdmin();
});

let seedCounter = 0;
async function seedEntity(): Promise<string> {
  // Unique jurisdiction code per call so two-entity tests don't collide
  // on jurisdictions.code unique constraint.
  seedCounter += 1;
  const code = `TST${seedCounter}`;
  const j = await h.seedJurisdiction(code);
  const e = await createEntity(h.db, h.actor, {
    kind: "legal",
    name: `Demo ${code}`,
    entityType: "X",
    jurisdictionId: j,
    baseCurrency: "EUR",
    financialYearStartMonth: 1,
    vatRegistered: false,
    address: {},
    metadata: {},
  });
  return e.id;
}

beforeEach(() => {
  seedCounter = 0;
});

const FY2025 = {
  kind: "year" as const,
  label: "FY2025",
  startAt: new Date("2025-01-01T00:00:00Z"),
  endAt: new Date("2025-12-31T23:59:59Z"),
};

describe("createPeriod", () => {
  it("inserts and writes period.created audit with entity + label", async () => {
    const entityId = await seedEntity();
    const p = await createPeriod(h.db, h.actor, { entityId, ...FY2025 });

    expect(p.label).toBe("FY2025");
    expect(p.locked).toBe(false);

    const audit = await h.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "period.created"));
    expect(audit).toHaveLength(1);
    expect(audit[0]?.payload).toMatchObject({ periodId: p.id, entityId, label: "FY2025" });
  });

  it("rejects endAt == startAt with ValidationError", async () => {
    const entityId = await seedEntity();
    const d = new Date("2025-01-01T00:00:00Z");
    await expect(
      createPeriod(h.db, h.actor, {
        entityId,
        kind: "custom",
        label: "zero",
        startAt: d,
        endAt: d,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects endAt < startAt with ValidationError", async () => {
    const entityId = await seedEntity();
    await expect(
      createPeriod(h.db, h.actor, {
        entityId,
        kind: "custom",
        label: "inverted",
        startAt: new Date("2025-12-01T00:00:00Z"),
        endAt: new Date("2025-01-01T00:00:00Z"),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects unknown entity with ValidationError", async () => {
    await expect(
      createPeriod(h.db, h.actor, { entityId: "ent_nope", ...FY2025 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("lockPeriod", () => {
  it("sets locked/lockedAt/lockedBy/lockReason + audits period.locked", async () => {
    const entityId = await seedEntity();
    const p = await createPeriod(h.db, h.actor, { entityId, ...FY2025 });
    const locked = await lockPeriod(h.db, h.actor, { periodId: p.id, reason: "filed with EMTA" });

    expect(locked.locked).toBe(true);
    expect(locked.lockedAt).toBeInstanceOf(Date);
    expect(locked.lockedBy).toBe(h.actor.userId);
    expect(locked.lockReason).toBe("filed with EMTA");

    const audit = await h.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "period.locked"));
    expect(audit).toHaveLength(1);
    expect(audit[0]?.payload).toMatchObject({
      periodId: p.id,
      entityId,
      label: "FY2025",
      reason: "filed with EMTA",
    });
  });

  it("rejects double-lock with ConflictError", async () => {
    const entityId = await seedEntity();
    const p = await createPeriod(h.db, h.actor, { entityId, ...FY2025 });
    await lockPeriod(h.db, h.actor, { periodId: p.id, reason: "first" });
    await expect(
      lockPeriod(h.db, h.actor, { periodId: p.id, reason: "second" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects unknown periodId with NotFoundError", async () => {
    await expect(
      lockPeriod(h.db, h.actor, { periodId: "fp_nope", reason: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("unlockPeriod", () => {
  it("clears lock fields + audits period.unlocked", async () => {
    const entityId = await seedEntity();
    const p = await createPeriod(h.db, h.actor, { entityId, ...FY2025 });
    await lockPeriod(h.db, h.actor, { periodId: p.id, reason: "temp" });
    const unlocked = await unlockPeriod(h.db, h.actor, {
      periodId: p.id,
      reason: "correction needed",
    });

    expect(unlocked.locked).toBe(false);
    expect(unlocked.lockedAt).toBeNull();
    expect(unlocked.lockedBy).toBeNull();
    expect(unlocked.lockReason).toBeNull();

    const audit = await h.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "period.unlocked"));
    expect(audit).toHaveLength(1);
    expect(audit[0]?.payload).toMatchObject({ periodId: p.id, reason: "correction needed" });
  });

  it("rejects unlocking an unlocked period with ConflictError", async () => {
    const entityId = await seedEntity();
    const p = await createPeriod(h.db, h.actor, { entityId, ...FY2025 });
    await expect(unlockPeriod(h.db, h.actor, { periodId: p.id })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("rejects unknown periodId with NotFoundError", async () => {
    await expect(unlockPeriod(h.db, h.actor, { periodId: "fp_nope" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("assertPeriodUnlocked — boundary semantics", () => {
  it("rejects when occurredAt equals startAt (inclusive lower bound)", async () => {
    const entityId = await seedEntity();
    const p = await createPeriod(h.db, h.actor, { entityId, ...FY2025 });
    await lockPeriod(h.db, h.actor, { periodId: p.id, reason: "x" });
    await expect(
      assertPeriodUnlocked(h.db, { entityId, occurredAt: FY2025.startAt }),
    ).rejects.toBeInstanceOf(PeriodLockedError);
  });

  it("rejects when occurredAt equals endAt (inclusive upper bound)", async () => {
    const entityId = await seedEntity();
    const p = await createPeriod(h.db, h.actor, { entityId, ...FY2025 });
    await lockPeriod(h.db, h.actor, { periodId: p.id, reason: "x" });
    await expect(
      assertPeriodUnlocked(h.db, { entityId, occurredAt: FY2025.endAt }),
    ).rejects.toBeInstanceOf(PeriodLockedError);
  });

  it("passes one millisecond before startAt", async () => {
    const entityId = await seedEntity();
    const p = await createPeriod(h.db, h.actor, { entityId, ...FY2025 });
    await lockPeriod(h.db, h.actor, { periodId: p.id, reason: "x" });
    await expect(
      assertPeriodUnlocked(h.db, {
        entityId,
        occurredAt: new Date(FY2025.startAt.getTime() - 1),
      }),
    ).resolves.toBeUndefined();
  });

  it("passes one millisecond after endAt", async () => {
    const entityId = await seedEntity();
    const p = await createPeriod(h.db, h.actor, { entityId, ...FY2025 });
    await lockPeriod(h.db, h.actor, { periodId: p.id, reason: "x" });
    await expect(
      assertPeriodUnlocked(h.db, {
        entityId,
        occurredAt: new Date(FY2025.endAt.getTime() + 1),
      }),
    ).resolves.toBeUndefined();
  });

  it("passes when the matching period is not locked (locked=false)", async () => {
    const entityId = await seedEntity();
    await createPeriod(h.db, h.actor, { entityId, ...FY2025 });
    await expect(
      assertPeriodUnlocked(h.db, { entityId, occurredAt: new Date("2025-06-15T00:00:00Z") }),
    ).resolves.toBeUndefined();
  });

  it("does not cross entities — same dates, different entity passes", async () => {
    const entityA = await seedEntity();
    const entityB = await seedEntity();
    const p = await createPeriod(h.db, h.actor, { entityId: entityA, ...FY2025 });
    await lockPeriod(h.db, h.actor, { periodId: p.id, reason: "x" });

    await expect(
      assertPeriodUnlocked(h.db, { entityId: entityA, occurredAt: FY2025.startAt }),
    ).rejects.toBeInstanceOf(PeriodLockedError);
    await expect(
      assertPeriodUnlocked(h.db, { entityId: entityB, occurredAt: FY2025.startAt }),
    ).resolves.toBeUndefined();
  });

  it("PeriodLockedError carries periodId, entityId, occurredAt, lockedAt, lockReason", async () => {
    const entityId = await seedEntity();
    const p = await createPeriod(h.db, h.actor, { entityId, ...FY2025 });
    await lockPeriod(h.db, h.actor, { periodId: p.id, reason: "final" });

    try {
      await assertPeriodUnlocked(h.db, { entityId, occurredAt: FY2025.startAt });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PeriodLockedError);
      const e = err as PeriodLockedError;
      expect(e.meta).toMatchObject({
        periodId: p.id,
        entityId,
        lockReason: "final",
      });
      expect((e.meta as { occurredAt: Date }).occurredAt).toBeInstanceOf(Date);
      expect((e.meta as { lockedAt: Date }).lockedAt).toBeInstanceOf(Date);
    }
  });
});
