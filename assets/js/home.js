import { openStore } from "../../ui/js/store.js";
import { ruDateLong, todayIso } from "../../ui/js/format.js";
import { cleanCase } from "../../lib/backup.js";

const box = document.querySelector("[data-continue]");

async function main() {
  const all = await openStore("obrashchenie-kit").list();
  const cases = all.filter((e) => typeof e.key === "string" && e.key.startsWith("case:")).map((e) => cleanCase(e.value)).filter((c) => c && !c.closed_at)
    .sort((a, b) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at));
  if (!cases.length || !box) return;
  const c = cases[0];
  const row = [...document.querySelectorAll(".ok-scen a")].find((a) => a.getAttribute("href").endsWith(`scenarios/${c.scenario}/`));
  const title = row?.querySelector(".op-row__title")?.textContent || "Дело";
  const line = box.querySelector("[data-continue-line]");
  if (c.last_due && c.last_due < todayIso()) line.textContent = `${title}. Срок ответа прошёл, можно сделать следующий шаг`;
  else if (c.last_due) line.textContent = `${title}. Ответ должен прийти до ${ruDateLong(c.last_due)}`;
  else line.textContent = `${title}. Следующий шаг: собрать документ`;
  box.querySelector("[data-continue-link]").href += `#id=${c.id}`;
  box.hidden = false;
}

main().catch(() => {});
