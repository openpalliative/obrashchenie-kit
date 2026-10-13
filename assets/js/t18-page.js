import { $, guardForms, failPage, kit, vend, loadJson, today, dueWords, dayWords, cloneTpl, readDate3, showJs, statusEl, unverifiedInline } from "./ok-core.js";
import { computeDeadline } from "../../vendor/pal-norms/lib/deadlines.js";
import { buildIcs } from "../../ui/js/ics.js";
import { downloadText } from "../../ui/js/files.js";
import { turning18, birthday18 } from "../../lib/turning18.js";

guardForms();

let rows = [];

async function calc(e) {
  e.preventDefault();
  const { iso, error } = readDate3($("#ok-birth"), { notBefore: "1990-01-01" });
  if (error) return;
  const b18 = birthday18(iso);
  if (b18 <= today()) {
    readDate3($("#ok-birth"));
    const box = $("#ok-birth .op-field__error");
    box.querySelector("[data-error]").textContent = "Ребёнку уже исполнилось 18. Этот расчёт для тех, кому ещё нет 18";
    box.hidden = false;
    return;
  }
  const [items, rules, calendar] = await Promise.all([kit("turning18"), vend("pal-norms", "deadline-rules"), loadJson("../../vendor/pal-norms/v1/calendar.json")]);
  rows = turning18(iso, { items, rules, calendar, computeDeadline });
  $("[data-for-line]").textContent = `18 лет исполнится ${dayWords(b18)}`;
  $("[data-list]").replaceChildren(...rows.map((r) => {
    const li = cloneTpl("ok-t18-item");
    li.classList.add(`is-${r.kind}`);
    li.classList.toggle("is-past", Boolean(r.date) && (r.margin_date || r.date) < today());
    $(".ok-t18__date", li).textContent = !r.date ? "Дату пока не считаем" : (r.margin_date ? `до ${dueWords(r.margin_date)}` : dayWords(r.date)).replace(/(\d) /g, "$1\u00a0");
    $(".ok-t18__label", li).textContent = r.label;
    $(".ok-t18__text", li).textContent = r.margin_date ? `${r.text}. Последний день по приказу: ${dayWords(r.date)}` : r.text;
    $(".ok-t18__formula", li).textContent = r.kind === "family_orientir" ? `${r.formula}. Ориентир, не норма` : r.formula;
    const st = $(".ok-t18__status", li);
    if (!r.verified) st.append(unverifiedInline());
    if (r.date && !r.calendar_verified) st.append(statusEl("info", "Важно", `Календарь на ${r.date.slice(0, 4)} год ещё не утверждён. Мы взяли запас, дата может сдвинуться на несколько дней`));
    if (r.rule_missing) st.append(statusEl("unverified", "Не проверено", "Правила срока пока нет в разделе «Нормы и сроки». Дату покажем, когда его опубликуют"));
    if (r.date && (r.margin_date || r.date) < today()) st.append(statusEl("deadline", "Срок", "Эта дата уже прошла. Попросите как можно скорее"));
    return li;
  }));
  $("[data-result]").hidden = false;
  $("#ok-t18-res").focus();
}

showJs();
$(".ok-t18__form").addEventListener("submit", (e) => calc(e).catch(failPage));
$("[data-ics]").addEventListener("click", () => {
  const events = rows.filter((r) => r.kind !== "fact" && r.date && (r.margin_date || r.date) >= today()).map((r) => ({
    uid: `t18-${r.id}-${r.date}@openpalliative`, date: r.margin_date || r.date,
    summary: r.kind === "family_orientir" ? "Ориентир перед 18-летием" : "Срок перед 18-летием", description: r.label, alarmsDaysBefore: [7, 1],
  }));
  downloadText(buildIcs(events), "18-let.ics", "text/calendar;charset=utf-8");
});
