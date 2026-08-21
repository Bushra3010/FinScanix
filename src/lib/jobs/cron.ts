/**
 * A small five-field cron reader — enough for the schedules this product
 * exposes (daily, weekday sets, monthly), without a dependency.
 *
 * Fields: minute hour day-of-month month day-of-week. Supports `*`, lists
 * (`1,4`), ranges (`1-5`) and steps (`*​/15`). Sunday is 0.
 */

interface CronFields {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

function expand(field: string, min: number, max: number): number[] {
  const out = new Set<number>();

  for (const part of field.split(",")) {
    const [range, stepRaw] = part.split("/");
    const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isInteger(step) || step < 1) throw new Error(`Bad step in "${part}"`);

    let from: number;
    let to: number;

    if (range === "*") {
      from = min;
      to = max;
    } else if (range.includes("-")) {
      const [a, b] = range.split("-").map(Number);
      from = a;
      to = b;
    } else {
      from = Number(range);
      to = from;
    }

    if (!Number.isInteger(from) || !Number.isInteger(to) || from < min || to > max || from > to) {
      throw new Error(`Value out of range in "${part}"`);
    }
    for (let value = from; value <= to; value += step) out.add(value);
  }

  return [...out].sort((a, b) => a - b);
}

export function parseCron(expression: string): CronFields {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`"${expression}" is not a five-field cron expression`);
  }
  return {
    minute: expand(parts[0], 0, 59),
    hour: expand(parts[1], 0, 23),
    dayOfMonth: expand(parts[2], 1, 31),
    month: expand(parts[3], 1, 12),
    dayOfWeek: expand(parts[4], 0, 6),
  };
}

/**
 * Schedules are expressed in IST, because that is the working day of every
 * user of this product. Computing in UTC would silently shift a 03:00 job.
 *
 * India does not observe daylight-saving time, so the offset is constant.
 */
const IST_OFFSET_MINUTES = 5 * 60 + 30; // +05:30 — no DST

function toIst(date: Date) {
  return new Date(date.getTime() + IST_OFFSET_MINUTES * 60_000);
}

function fromIst(date: Date) {
  return new Date(date.getTime() - IST_OFFSET_MINUTES * 60_000);
}

/**
 * The next firing strictly after `from`. Cron's day-of-month / day-of-week
 * rule: when both are restricted the match is a union, not an intersection.
 */
export function nextRunAfter(expression: string, from: Date = new Date()): Date {
  const fields = parseCron(expression);
  const restrictedDom = !/^\*(\/\d+)?$/.test(expression.trim().split(/\s+/)[2]);
  const restrictedDow = !/^\*(\/\d+)?$/.test(expression.trim().split(/\s+/)[4]);

  const cursor = toIst(from);
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);

  // Four years covers every schedule this parser accepts, including 29 February.
  const limit = new Date(cursor.getTime() + 4 * 366 * 24 * 60 * 60_000);

  while (cursor <= limit) {
    const month = cursor.getUTCMonth() + 1;
    if (!fields.month.includes(month)) {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
      cursor.setUTCHours(0, 0, 0, 0);
      continue;
    }

    const domOk = fields.dayOfMonth.includes(cursor.getUTCDate());
    const dowOk = fields.dayOfWeek.includes(cursor.getUTCDay());
    const dayOk =
      restrictedDom && restrictedDow ? domOk || dowOk : restrictedDom ? domOk : dowOk;

    if (!dayOk) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      cursor.setUTCHours(0, 0, 0, 0);
      continue;
    }

    if (!fields.hour.includes(cursor.getUTCHours())) {
      cursor.setUTCHours(cursor.getUTCHours() + 1, 0, 0, 0);
      continue;
    }

    if (!fields.minute.includes(cursor.getUTCMinutes())) {
      cursor.setUTCMinutes(cursor.getUTCMinutes() + 1, 0, 0);
      continue;
    }

    return fromIst(cursor);
  }

  throw new Error(`"${expression}" has no firing time in the next four years`);
}

/** Human-readable form for the interface, so admins can sanity-check a schedule. */
export function describeCron(expression: string): string {
  try {
    const next = nextRunAfter(expression);
    return `next ${next.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`;
  } catch {
    return "invalid schedule";
  }
}
