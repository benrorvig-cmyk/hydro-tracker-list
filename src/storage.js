const KEY = "tracker-projects-v1";

export async function getProjects() {
  const res = await fetch(`/api/storage?key=${KEY}`);
  if (!res.ok) throw new Error("Failed to load projects");
  const data = await res.json();
  return data.value ? JSON.parse(data.value) : [];
}

export async function saveProjects(list) {
  const res = await fetch(`/api/storage?key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: JSON.stringify(list) }),
  });
  if (!res.ok) throw new Error("Failed to save projects");
}
