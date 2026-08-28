// ── Per-office key namespacing ───────────────────────────────────────
// Each Vercel deploy can point at the SAME Upstash database and stay
// isolated by prefixing its keys. Set VITE_OFFICE_PREFIX per deploy:
//
//   Portland : leave unset            → keys stay "tracker-projects-v1"
//              (preserves the existing live data — do NOT set a prefix)
//   Seattle  : VITE_OFFICE_PREFIX=seattle → keys become "seattle:tracker-projects-v1"
//
// The prefix is sanitised to a safe token so a malformed value can't
// produce colliding or broken keys.
const RAW_PREFIX = (import.meta.env?.VITE_OFFICE_PREFIX || "").trim();
const OFFICE_PREFIX = RAW_PREFIX
  ? RAW_PREFIX.toLowerCase().replace(/[^a-z0-9_-]/g, "") + ":"
  : "";

// Build a namespaced key. Portland (no prefix) → "tracker-projects-v1".
const k = (base) => `${OFFICE_PREFIX}${base}`;

const PROJECTS_KEY = k("tracker-projects-v1");
const PEOPLE_KEY = k("tracker-people-v1");

// Exposed so the app can show which office/namespace it's pointed at.
export const officePrefix = OFFICE_PREFIX ? OFFICE_PREFIX.slice(0, -1) : "";

async function readError(res) {
  try {
    const data = await res.json();
    return data.error || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

async function readKey(key, fallback) {
  const res = await fetch(`/api/storage?key=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return data.value ?? fallback;
}

async function writeKey(key, value) {
  const res = await fetch(`/api/storage?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function getProjects() {
  const value = await readKey(PROJECTS_KEY, []);
  return Array.isArray(value) ? value : [];
}

export async function saveProjects(list) {
  await writeKey(PROJECTS_KEY, list);
}

export async function getPeople() {
  const value = await readKey(PEOPLE_KEY, null);
  return Array.isArray(value) ? value : null;
}

export async function savePeople(list) {
  await writeKey(PEOPLE_KEY, list);
}
