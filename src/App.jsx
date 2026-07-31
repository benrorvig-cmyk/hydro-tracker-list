import { useState, useEffect, useRef } from "react";
import { Plus, X, AlertTriangle, Clock, Check, User, Users, ChevronDown, Loader2, Search, ArrowLeft } from "lucide-react";
import { getProjects, saveProjects } from "./storage";

const STATUSES = ["Not started", "In progress", "Waiting on reply", "Done"];
const BOARD_STATUSES = ["Not started", "In progress", "Waiting on reply"];
const OWNERS = ["Ben", "Boone", "Both"];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function fmtDue(dueISO) {
  if (!dueISO) return null;
  const due = new Date(dueISO);
  const now = new Date();
  const diffMs = due - now;
  const diffH = diffMs / 3600000;
  const overdue = diffMs < 0;
  const dateStr = due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timeStr = due.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return { overdue, urgent: !overdue && diffH <= 2, label: `${dateStr}, ${timeStr}`, diffH };
}

function fmtUpdated(updatedISO) {
  if (!updatedISO) return null;
  const updated = new Date(updatedISO);
  const now = new Date();
  const diffDays = Math.floor((now - updated) / 86400000);
  const dateStr = updated.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  let rel;
  if (diffDays <= 0) rel = "today";
  else if (diffDays === 1) rel = "1 day ago";
  else rel = `${diffDays} days ago`;
  return { dateStr, diffDays, rel };
}

function defaultDueTime() {
  const d = new Date();
  d.setHours(16, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T16:00`;
}

const emptyDraft = () => ({
  id: null,
  title: "",
  owner: "Both",
  status: "Not started",
  due: "",
  notes: "",
  flagged: false,
  flagReason: "",
  updatedAt: "",
});

export default function HydroTracker() {
  const [projects, setProjects] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());
  const [editingId, setEditingId] = useState(null);
  const [now, setNow] = useState(new Date());
  const [view, setView] = useState("board"); // board | done
  const [doneSearch, setDoneSearch] = useState("");
  const [flagTarget, setFlagTarget] = useState(null);
  const [flagReasonInput, setFlagReasonInput] = useState("");
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [storageError, setStorageError] = useState("");
  const saveTimer = useRef(null);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getProjects();
        if (!cancelled) { setProjects(list); setStorageError(""); }
      } catch (e) {
        if (!cancelled) { setProjects([]); setStorageError(e.message || "Couldn't load the board"); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Poll for changes made by a teammate every 15s so the board stays in sync
  // without needing a real-time connection.
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const list = await getProjects();
        setProjects((prev) => (JSON.stringify(prev) !== JSON.stringify(list) ? list : prev));
        setStorageError("");
      } catch (e) {
        setStorageError(e.message || "Couldn't sync the board");
      }
    }, 15000);
    return () => clearInterval(poll);
  }, []);

  function persist(next) {
    setProjects(next);
    setSaveState("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await saveProjects(next);
        setSaveState("saved");
        setStorageError("");
        setTimeout(() => setSaveState("idle"), 1200);
      } catch (e) {
        setSaveState("idle");
        setStorageError(e.message || "Couldn't save — your last change may not have been kept");
      }
    }, 300);
  }

  function openNew() {
    setDraft({ ...emptyDraft(), due: defaultDueTime() });
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(p) {
    setDraft({ ...p, due: p.due ? p.due.slice(0, 16) : "" });
    setEditingId(p.id);
    setShowForm(true);
  }

  function saveDraft() {
    if (!draft.title.trim()) return;
    const dueISO = draft.due ? new Date(draft.due).toISOString() : "";
    const nowISO = new Date().toISOString();
    if (editingId) {
      persist(projects.map((p) => (p.id === editingId ? { ...draft, due: dueISO, updatedAt: nowISO } : p)));
    } else {
      persist([...projects, { ...draft, due: dueISO, id: uid(), updatedAt: nowISO }]);
    }
    setShowForm(false);
  }

  function removeProject(id) {
    persist(projects.filter((p) => p.id !== id));
  }

  function requestDelete(p) {
    setConfirmTarget(p);
  }

  function confirmDeleteNow() {
    if (confirmTarget) removeProject(confirmTarget.id);
    setConfirmTarget(null);
  }

  function toggleFlag(p) {
    const nowISO = new Date().toISOString();
    if (p.flagged) {
      persist(projects.map((x) => (x.id === p.id ? { ...x, flagged: false, flagReason: "", updatedAt: nowISO } : x)));
    } else {
      setFlagTarget(p);
      setFlagReasonInput("No reply from contact");
    }
  }

  function confirmFlagNow() {
    if (!flagTarget) return;
    const nowISO = new Date().toISOString();
    persist(projects.map((x) => (x.id === flagTarget.id ? { ...x, flagged: true, flagReason: flagReasonInput.trim() || "Flagged", updatedAt: nowISO } : x)));
    setFlagTarget(null);
  }

  function setStatus(p, status) {
    persist(projects.map((x) => (x.id === p.id ? { ...x, status, updatedAt: new Date().toISOString() } : x)));
  }

  if (loading || projects === null) {
    return (
      <div className="tr-root tr-center">
        <Loader2 className="tr-spin" size={22} />
      </div>
    );
  }

  const flaggedUrgent = projects.filter((p) => {
    const d = fmtDue(p.due);
    return p.flagged || (d && (d.urgent || d.overdue) && p.status !== "Done");
  });

  return (
    <div className="tr-root">
      <style>{css}</style>

      <header className="tr-header">
        <div className="tr-title-block">
          <div className="tr-eyebrow">Johnson Barrow &middot; Project Log</div>
          <h1>Hydro Tracker</h1>
        </div>
        <div className="tr-header-status">
          <span className={"tr-dot" + (saveState === "saving" ? " tr-dot-saving" : "")} />
          {saveState === "saving" ? "Saving…" : "Synced"}
        </div>
      </header>

      {storageError && (
        <div className="tr-errorbar">
          <AlertTriangle size={16} />
          <span>{storageError} — check that the database is connected in Vercel.</span>
        </div>
      )}

      {flaggedUrgent.length > 0 && (
        <div className="tr-alertbar">
          <AlertTriangle size={16} />
          <span>{flaggedUrgent.length} blind spot{flaggedUrgent.length > 1 ? "s" : ""} need attention</span>
        </div>
      )}

      <div className="tr-toolbar">
        <div className="tr-tabs">
          <button className={"tr-tab" + (view === "board" ? " tr-tab-active" : "")} onClick={() => setView("board")}>
            Board
          </button>
          <button className={"tr-tab" + (view === "done" ? " tr-tab-active" : "")} onClick={() => setView("done")}>
            Done <span className="tr-count">{projects.filter((p) => p.status === "Done").length}</span>
          </button>
        </div>
        {view === "board" && (
          <button className="tr-btn-primary" onClick={openNew}>
            <Plus size={16} /> New project
          </button>
        )}
        {view === "done" && (
          <div className="tr-search">
            <Search size={14} />
            <input
              placeholder="Search done projects…"
              value={doneSearch}
              onChange={(e) => setDoneSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      {view === "board" && (
      <div className="tr-board">
        {BOARD_STATUSES.map((status) => {
          const items = projects.filter((p) => p.status === status);
          return (
            <div className="tr-column" key={status}>
              <div className="tr-column-head">
                <span className="tr-pipe-dot" data-status={status} />
                {status}
                <span className="tr-count">{items.length}</span>
              </div>
              <div className="tr-column-body">
                {items.length === 0 && <div className="tr-empty">Nothing here</div>}
                {items.map((p) => {
                  const d = fmtDue(p.due);
                  const u = fmtUpdated(p.updatedAt);
                  const isBlindSpot = p.flagged || (d && (d.urgent || d.overdue) && p.status !== "Done");
                  return (
                    <div className={"tr-card" + (isBlindSpot ? " tr-card-flagged" : "")} key={p.id}>
                      {isBlindSpot && (
                        <div className="tr-flag-tag">
                          <AlertTriangle size={11} />
                          {p.flagged ? p.flagReason : d.overdue ? "Overdue" : "Due soon"}
                        </div>
                      )}
                      <div className="tr-card-title" onClick={() => openEdit(p)}>{p.title}</div>
                      <div className="tr-card-meta">
                        <span className="tr-owner">
                          {p.owner === "Both" ? <Users size={12} /> : <User size={12} />}
                          {p.owner}
                        </span>
                        {d && (
                          <span className={"tr-due" + (d.overdue ? " tr-due-over" : d.urgent ? " tr-due-urgent" : "")}>
                            <Clock size={12} /> {d.label}
                          </span>
                        )}
                      </div>
                      {p.notes && <div className="tr-card-notes">{p.notes}</div>}
                      <div className="tr-card-footer">
                        {u && (
                          <span className={"tr-updated" + (u.diffDays >= 5 ? " tr-updated-stale" : "")}>
                            {u.rel}
                          </span>
                        )}
                        <div className="tr-card-actions">
                          <select
                            value={p.status}
                            onChange={(e) => setStatus(p, e.target.value)}
                            className="tr-status-select"
                          >
                            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <button
                            className={"tr-flag-btn" + (p.flagged ? " tr-flag-btn-on" : "")}
                            onClick={() => toggleFlag(p)}
                            title={p.flagged ? "Unflag" : "Mark as blind spot"}
                          >
                            {p.flagged ? <Check size={13} /> : <AlertTriangle size={13} />}
                          </button>
                          <button className="tr-del-btn" onClick={() => requestDelete(p)} title="Delete">
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {view === "done" && (() => {
        const doneItems = projects
          .filter((p) => p.status === "Done")
          .filter((p) => p.title.toLowerCase().includes(doneSearch.trim().toLowerCase()))
          .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
        return (
          <div className="tr-donelist">
            {doneItems.length === 0 && (
              <div className="tr-empty tr-empty-lg">
                {doneSearch ? "No done projects match that search." : "No completed projects yet."}
              </div>
            )}
            {doneItems.map((p) => {
              const u = fmtUpdated(p.updatedAt);
              return (
                <div className="tr-donerow" key={p.id}>
                  <Check size={14} className="tr-done-check" />
                  <div className="tr-donerow-main">
                    <div className="tr-donerow-title" onClick={() => openEdit(p)}>{p.title}</div>
                    <div className="tr-donerow-meta">
                      <span className="tr-owner">
                        {p.owner === "Both" ? <Users size={12} /> : <User size={12} />}
                        {p.owner}
                      </span>
                      {u && <span>Completed {u.dateStr} &middot; {u.rel}</span>}
                    </div>
                  </div>
                  <button className="tr-del-btn" onClick={() => requestDelete(p)} title="Delete">
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        );
      })()}

      {showForm && (
        <div className="tr-modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="tr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tr-modal-head">
              <h2>{editingId ? "Edit project" : "New project"}</h2>
              <button className="tr-close" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <label className="tr-field">
              <span>Title</span>
              <input
                autoFocus
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="e.g. Riverside Lofts boiler spec"
              />
            </label>
            <div className="tr-field-row">
              <label className="tr-field">
                <span>Owner</span>
                <select value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })}>
                  {OWNERS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              <label className="tr-field">
                <span>Status</span>
                <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>
            <label className="tr-field">
              <span>Due</span>
              <input
                type="datetime-local"
                value={draft.due}
                onChange={(e) => setDraft({ ...draft, due: e.target.value })}
              />
            </label>
            <label className="tr-field">
              <span>Notes</span>
              <textarea
                rows={3}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Context, contact, link to the thread…"
              />
            </label>
            <div className="tr-modal-actions">
              {editingId && (
                <button className="tr-btn-danger" onClick={() => { setShowForm(false); requestDelete(draft); }}>
                  Delete
                </button>
              )}
              <button className="tr-btn-primary" onClick={saveDraft}>
                <Check size={16} /> {editingId ? "Save changes" : "Add project"}
              </button>
            </div>
          </div>
        </div>
      )}

      {flagTarget && (
        <div className="tr-modal-backdrop" onClick={() => setFlagTarget(null)}>
          <div className="tr-modal tr-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="tr-modal-head">
              <h2>Flag as blind spot</h2>
              <button className="tr-close" onClick={() => setFlagTarget(null)}><X size={18} /></button>
            </div>
            <p className="tr-modal-subtitle">{flagTarget.title}</p>
            <label className="tr-field">
              <span>Why is this a blind spot?</span>
              <input
                autoFocus
                value={flagReasonInput}
                onChange={(e) => setFlagReasonInput(e.target.value)}
                placeholder="e.g. no reply, missed deadline"
                onKeyDown={(e) => e.key === "Enter" && confirmFlagNow()}
              />
            </label>
            <div className="tr-modal-actions">
              <button className="tr-btn-ghost" onClick={() => setFlagTarget(null)}>Cancel</button>
              <button className="tr-btn-primary" onClick={confirmFlagNow}>
                <AlertTriangle size={16} /> Flag it
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmTarget && (
        <div className="tr-modal-backdrop" onClick={() => setConfirmTarget(null)}>
          <div className="tr-modal tr-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="tr-modal-head">
              <h2>Delete project?</h2>
              <button className="tr-close" onClick={() => setConfirmTarget(null)}><X size={18} /></button>
            </div>
            <p className="tr-modal-subtitle">
              "{confirmTarget.title}" will be removed for both of you. This can't be undone.
            </p>
            <div className="tr-modal-actions">
              <button className="tr-btn-ghost" onClick={() => setConfirmTarget(null)}>Cancel</button>
              <button className="tr-btn-danger tr-btn-danger-solid" onClick={confirmDeleteNow}>
                <X size={16} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="tr-footer">
        Shared board — changes sync for everyone with this link.
      </footer>
    </div>
  );
}

const css = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

.tr-root {
  --ink: #16233D;
  --paper: #F1F4F7;
  --paper-card: #FFFFFF;
  --line: #DAE1EA;
  --copper: #C1662F;
  --copper-dim: #E8C7AE;
  --ok: #3F7D5C;
  --alert: #B23A32;
  --muted: #66738C;
  font-family: 'IBM Plex Sans', sans-serif;
  background: var(--paper);
  background-image:
    linear-gradient(var(--line) 1px, transparent 1px),
    linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 32px 32px;
  background-position: -1px -1px;
  color: var(--ink);
  min-height: 100vh;
  padding: 28px;
  box-sizing: border-box;
}
.tr-root * { box-sizing: border-box; }
.tr-center { display: flex; align-items: center; justify-content: center; }
.tr-spin { animation: tr-spin 1s linear infinite; color: var(--copper); }
@keyframes tr-spin { to { transform: rotate(360deg); } }

.tr-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 16px;
  border-bottom: 2px solid var(--ink);
  padding-bottom: 14px;
  margin-bottom: 18px;
}
.tr-eyebrow {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--copper);
  margin-bottom: 4px;
}
.tr-header h1 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 30px;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.01em;
}
.tr-header-status {
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  color: var(--muted);
  padding-bottom: 3px;
}
.tr-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--ok);
  flex-shrink: 0;
}
.tr-dot-saving { background: var(--copper); }

.tr-alertbar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #FBEAE6;
  border: 1px solid #E3B6AE;
  color: var(--alert);
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 5px;
  margin-bottom: 16px;
}
.tr-errorbar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #3A2420;
  border: 1px solid #6B342B;
  color: #F3D9D3;
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 5px;
  margin-bottom: 16px;
}

.tr-toolbar {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
.tr-tabs { display: flex; gap: 4px; }
.tr-tab {
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 13px;
  font-weight: 600;
  background: none;
  border: 1px solid var(--line);
  color: var(--muted);
  padding: 7px 14px;
  border-radius: 5px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}
.tr-tab-active { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.tr-tab .tr-count { margin-left: 0; color: inherit; opacity: 0.7; }
.tr-search {
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--paper-card);
  border: 1px solid var(--line);
  border-radius: 5px;
  padding: 7px 10px;
  color: var(--muted);
  min-width: 220px;
}
.tr-search input {
  border: none;
  outline: none;
  background: none;
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 13px;
  color: var(--ink);
  width: 100%;
}
.tr-donelist {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 640px;
}
.tr-empty-lg { padding: 30px 4px; text-align: center; }
.tr-donerow {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--paper-card);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 10px 12px;
}
.tr-done-check {
  color: var(--ok);
  flex-shrink: 0;
}
.tr-donerow-main { flex: 1; min-width: 0; }
.tr-donerow-title {
  font-weight: 600;
  font-size: 13.5px;
  cursor: pointer;
}
.tr-donerow-title:hover { color: var(--copper); }
.tr-donerow-meta {
  display: flex;
  gap: 12px;
  font-size: 11.5px;
  color: var(--muted);
  margin-top: 3px;
}
.tr-donerow-meta .tr-owner { display: inline-flex; align-items: center; gap: 4px; }
.tr-btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--ink);
  color: var(--paper);
  border: none;
  padding: 9px 16px;
  border-radius: 5px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: 'IBM Plex Sans', sans-serif;
}
.tr-btn-primary:hover { background: var(--copper); }
.tr-btn-danger {
  background: none;
  border: 1px solid var(--alert);
  color: var(--alert);
  padding: 9px 14px;
  border-radius: 5px;
  font-size: 13px;
  cursor: pointer;
}

.tr-board {
  display: grid;
  grid-template-columns: repeat(3, minmax(220px, 1fr));
  gap: 14px;
  overflow-x: auto;
}
@media (max-width: 900px) {
  .tr-board { grid-template-columns: 1fr; }
}
.tr-column-head {
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 600;
  font-size: 13px;
  padding: 6px 2px 10px 2px;
  border-bottom: 1.5px solid var(--ink);
  margin-bottom: 10px;
}
.tr-pipe-dot {
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--muted);
  flex-shrink: 0;
}
.tr-pipe-dot[data-status="Waiting on reply"] { background: var(--copper); }
.tr-count {
  margin-left: auto;
  font-family: 'IBM Plex Mono', monospace;
  color: var(--muted);
  font-size: 11px;
}
.tr-column-body { display: flex; flex-direction: column; gap: 10px; min-height: 40px; }
.tr-empty {
  font-size: 12px;
  color: var(--muted);
  font-style: italic;
  padding: 10px 4px;
}

.tr-card {
  background: var(--paper-card);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 12px 13px 10px;
  position: relative;
}
.tr-card-flagged {
  border-color: var(--alert);
  border-left: 3px solid var(--alert);
}
.tr-flag-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #FBEAE6;
  color: var(--alert);
  font-size: 10.5px;
  font-weight: 600;
  padding: 3px 7px;
  border-radius: 3px;
  margin-bottom: 8px;
}
.tr-card-title {
  font-weight: 600;
  font-size: 13.5px;
  cursor: pointer;
  margin-bottom: 7px;
  line-height: 1.35;
}
.tr-card-title:hover { color: var(--copper); }
.tr-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 11.5px;
  color: var(--muted);
}
.tr-owner, .tr-due { display: flex; align-items: center; gap: 4px; }
.tr-due-urgent { color: var(--copper); font-weight: 600; }
.tr-due-over { color: var(--alert); font-weight: 600; }
.tr-card-notes {
  font-size: 11.5px;
  color: var(--muted);
  margin-top: 8px;
  line-height: 1.4;
}
.tr-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
}
.tr-updated {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: #9AA5B8;
  white-space: nowrap;
}
.tr-updated-stale { color: var(--copper); }
.tr-card-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
}
.tr-status-select {
  font-size: 10.5px;
  font-family: 'IBM Plex Sans', sans-serif;
  border: none;
  background: var(--paper);
  color: var(--muted);
  border-radius: 3px;
  padding: 4px 6px;
  max-width: 108px;
}
.tr-status-select:hover { color: var(--ink); }
.tr-flag-btn, .tr-del-btn {
  border: none;
  background: none;
  border-radius: 3px;
  padding: 4px;
  cursor: pointer;
  color: #A8B2C4;
  display: flex;
}
.tr-flag-btn-on { color: var(--alert); }
.tr-flag-btn:hover { color: var(--alert); background: #FBEAE6; }
.tr-del-btn:hover { color: var(--alert); background: #FBEAE6; }

.tr-modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(22, 35, 61, 0.45);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  z-index: 10;
}
.tr-modal {
  background: var(--paper-card);
  border-radius: 8px;
  padding: 20px;
  width: 100%;
  max-width: 420px;
  max-height: 90vh;
  overflow-y: auto;
}
.tr-modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.tr-modal-head h2 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 17px;
  margin: 0;
}
.tr-close { background: none; border: none; cursor: pointer; color: var(--muted); }
.tr-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); margin-bottom: 12px; }
.tr-field-row { display: flex; gap: 10px; }
.tr-field-row .tr-field { flex: 1; }
.tr-field input, .tr-field select, .tr-field textarea {
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 13.5px;
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 8px 9px;
  resize: vertical;
}
.tr-field input:focus, .tr-field select:focus, .tr-field textarea:focus {
  outline: 2px solid var(--copper);
  outline-offset: 1px;
}
.tr-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
.tr-modal-sm { max-width: 340px; }
.tr-modal-subtitle {
  font-size: 13px;
  color: var(--muted);
  margin: 0 0 14px;
  line-height: 1.4;
}
.tr-btn-ghost {
  background: none;
  border: 1px solid var(--line);
  color: var(--muted);
  padding: 9px 14px;
  border-radius: 5px;
  font-size: 13px;
  cursor: pointer;
  font-family: 'IBM Plex Sans', sans-serif;
}
.tr-btn-ghost:hover { color: var(--ink); border-color: var(--ink); }
.tr-btn-danger-solid {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--alert);
  color: #fff;
  border-color: var(--alert);
}
.tr-btn-danger-solid:hover { background: #962e28; }

.tr-footer {
  margin-top: 22px;
  text-align: center;
  font-size: 11px;
  color: var(--muted);
  font-family: 'IBM Plex Mono', monospace;
}
`;
