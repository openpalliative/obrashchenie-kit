import { $, link, today, el, readDate3, setDate3, showJs, kit, guardForms } from "./ok-core.js";
import { listCases, saveCase, pushEvent } from "./ok-store.js";
import { ruDate } from "../../ui/js/format.js";

guardForms();

const form = $("[data-callsheet]");
const FIELDS = ["where", "who", "said", "asked"];
const LABELS = { where: "Куда", who: "Кто ответил", said: "Сказали", asked: "Просили" };
let open = [];
let titles = {};

function syncPrint() {
  for (const id of FIELDS) $(`[data-value="${id}"]`).textContent = form[id].value.trim();
  form.classList.toggle("is-filled", FIELDS.some((id) => form[id].value.trim()));
  const d = readDate3($("#ok-call-date"));
  $(".ok-cf__print").textContent = d.iso ? `Дата ${ruDate(d.iso)}${form.time.value ? `, время ${form.time.value}` : ""}` : "Дата «___» ____________ 20___ г., время ______";
}

async function loadCases() {
  open = (await listCases()).filter((c) => !c.closed_at);
  titles = Object.fromEntries((await kit("scenarios")).map((s) => [s.id, s.title]));
  const pick = $("[data-case-pick]");
  pick.hidden = open.length < 2;
  $("[data-case-pick-list]").replaceChildren(...open.map((c) => {
    const label = el("label", "op-choice__item");
    const input = el("input");
    input.type = "radio";
    input.name = "case_pick";
    input.value = c.id;
    label.append(input, el("span", null, `${titles[c.scenario] || "Дело"}, начато ${ruDate(c.created_at)}`));
    return label;
  }));
}

async function add() {
  const live = $("[data-live]");
  const d = readDate3($("#ok-call-date"));
  if (d.error) return;
  const picked = $("input[name=case_pick]:checked")?.value;
  await loadCases();
  const again = picked && $(`input[name=case_pick][value="${CSS.escape(picked)}"]`);
  if (again) again.checked = true;
  if (!open.length) {
    live.replaceChildren("Дел на этом устройстве пока нет. ", link("../case/#new=1&s=oral-refusal", "Начать дело"));
    return;
  }
  const chosen = open.length === 1 ? open[0].id : $("input[name=case_pick]:checked")?.value;
  const c = open.find((x) => x.id === chosen);
  if (!c) {
    live.textContent = "Выберите, в какое дело записать разговор";
    $("input[name=case_pick]")?.focus();
    return;
  }
  const note = [form.time.value && `Время ${form.time.value}`, ...FIELDS.filter((id) => form[id].value.trim()).map((id) => `${LABELS[id]}: ${form[id].value.trim()}`)].filter(Boolean).join(". ");
  pushEvent(c, { at: d.iso, type: "call", note: note.slice(0, 500) });
  await saveCase(c);
  live.replaceChildren(`Записано в дело «${titles[c.scenario] || "Дело"}». `, link(`../case/#id=${c.id}`, "Открыть дело"));
}

showJs();
setDate3($("#ok-call-date"), today());
form.addEventListener("input", syncPrint);
form.addEventListener("change", syncPrint);
window.addEventListener("beforeprint", syncPrint);
$("[data-add]").addEventListener("click", () => add().catch((e) => {
  console.warn(e);
  $("[data-live]").textContent = "Не получилось записать в дело. Обновите страницу, данные на устройстве не удалены";
}));
loadCases().catch((e) => console.warn(e));
