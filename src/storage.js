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
  return data.value ? JSON.parse(data.value) : [];
}

export async function saveProjects(list) {
  const res = await fetch(`/api/storage?key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: JSON.stringify(list) }),
  });
  if (!res.ok) throw new Error(await readError(res));
}
