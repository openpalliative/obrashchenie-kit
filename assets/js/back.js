const p = document.querySelector("[data-back]");
const raw = /(?:^#|&)back=([a-z0-9-]+)/.exec(location.hash);
if (p && raw) {
  const rest = "strip" in p.dataset ? "" : location.hash.slice(1).split("&").filter((kv) => !kv.startsWith("back=")).join("&");
  history.replaceState(history.state, "", location.pathname + location.search + (rest ? `#${rest}` : ""));
  fetch(new URL("../situations.json", import.meta.url)).then((r) => r.json()).then((list) => {
    const s = list.find((x) => x.id === raw[1]);
    if (!s) return;
    const a = p.querySelector("a");
    a.href = `${p.dataset.base}${s.id}/`;
    a.querySelector("span").textContent = `Вернуться: ${s.title}`;
    p.hidden = false;
  }).catch(() => {});
}
