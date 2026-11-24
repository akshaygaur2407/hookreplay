
const TARGET_KEY = "hookreplay:target";

export function loadTarget(): string {
  try {
    return localStorage.getItem(TARGET_KEY) ?? "http://localhost:3000/webhook";
  } catch {
    return "http://localhost:3000/webhook";
  }
}

export function saveTarget(url: string) {
  try {
    localStorage.setItem(TARGET_KEY, url);
  } catch {
    /* ignore */
  }
}
