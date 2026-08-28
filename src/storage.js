const KEY = "tracker-projects-v1";

async function readError(res) {
  try {
    const data = await res.json();
    return data.error || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export async function getProjects() {
  const res = await fetch(`/api/storage?key=${KEY}`);
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return Array.isArray(data.value) ? data.value : [];
}

export async function saveProjects(list) {
  const res = await fetch(`/api/storage?key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: list }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

const PEOPLE_KEY = "tracker-people-v1";

export async function getPeople() {
  const res = await fetch(`/api/storage?key=${PEOPLE_KEY}`);
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return Array.isArray(data.value) ? data.value : null;
}

export async function savePeople(list) {
  const res = await fetch(`/api/storage?key=${PEOPLE_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: list }),
  });
  if (!res.ok) throw new Error(await readError(res));
}
