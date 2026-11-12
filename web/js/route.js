// Which page an address means. The part after "#" picks the page:
// "#/" is Home, "#/sleep" the Sleep page, "#/settings" Settings.

// "#/sleep" -> "sleep". Anything unknown, or a module that is switched off, -> "home".
export function pageFromHash(hash, modules) {
  const name = hash.startsWith("#/") ? hash.slice(2) : "";
  if (name === "settings" || modules.includes(name)) return name;
  return "home";
}

// The address for a page: "home" -> "#/", "work" -> "#/work".
export function hashFor(page) {
  return page === "home" ? "#/" : `#/${page}`;
}
