// Which page an address means. The part after "#" picks the page:
// "#/" is Home, "#/sleep" the Sleep page, "#/insights" Insights, "#/settings" Settings.

// "#/sleep" -> "sleep". Anything unknown, or a module that is switched off, -> "home".
// Focus is only a page when Study or Work is on: it is their shared timer. "#/focus/stats"
// is its full statistics page ("focus-stats").
export function pageFromHash(hash, modules) {
  const name = hash.startsWith("#/") ? hash.slice(2) : "";
  const focusOn = modules.some((id) => id === "study" || id === "work");
  if (name === "focus" && focusOn) return "focus";
  if (name === "focus/stats" && focusOn) return "focus-stats";
  if (name === "settings" || name === "insights" || modules.includes(name)) return name;
  return "home";
}

// The address for a page: "home" -> "#/", "work" -> "#/work".
export function hashFor(page) {
  if (page === "focus-stats") return "#/focus/stats";
  return page === "home" ? "#/" : `#/${page}`;
}
