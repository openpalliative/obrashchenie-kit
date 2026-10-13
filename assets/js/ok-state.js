import { computeDeadline } from "../../vendor/pal-norms/lib/deadlines.js";
import { reduceCase } from "../../lib/case.js";
import { kit, vend, loadJson, today } from "./ok-core.js";

export async function caseState(c) {
  const [rules, calendar, replyTypes] = await Promise.all([
    vend("pal-norms", "deadline-rules"), loadJson("../../vendor/pal-norms/v1/calendar.json").catch(() => ({ items: [] })),
    kit("reply-types"),
  ]);
  return reduceCase(c, { rules, calendar, computeDeadline, today: today(), replyTypes });
}
