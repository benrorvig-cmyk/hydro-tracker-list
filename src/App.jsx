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

// How long a project has sat in its current column. Falls back to updatedAt for
// projects created before statusChangedAt was tracked.
function fmtInStatus(p) {
  const iso = p.statusChangedAt || p.updatedAt;
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (days < 1) return null;
  const level = days >= 14 ? "alert" : days >= 7 ? "warn" : "ok";
  return { days, level, label: `${days}d in stage` };
}

function dayLabel(dueISO) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dueISO); target.setHours(0, 0, 0, 0);
  const diff = Math.round((target - today) / 86400000);
  if (diff < 0) return "Overdue";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return target.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

const emptyDraft = () => ({
  id: null,
  title: "",
  owner: "Both",
  status: "Not started",
  due: "",
  notes: "",
  projectCode: "",
  flagged: false,
  flagReason: "",
  updatedAt: "",
  statusChangedAt: "",
});


function randomBetween(a, b) { return a + Math.random() * (b - a); }

function ConfettiBurst() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const COLORS = ["#C1662F","#3F7D5C","#16233D","#F1A35A","#6EB89A","#E8C7AE","#B23A32","#5C8DD6"];
    const SHAPES = ["rect", "circle", "strip"];
    const count = 120;
    const particles = Array.from({ length: count }, () => ({
      x: randomBetween(canvas.width * 0.25, canvas.width * 0.75),
      y: randomBetween(canvas.height * 0.3, canvas.height * 0.5),
      vx: randomBetween(-6, 6),
      vy: randomBetween(-14, -4),
      rot: randomBetween(0, Math.PI * 2),
      rotV: randomBetween(-0.2, 0.2),
      w: randomBetween(7, 14),
      h: randomBetween(5, 10),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
      alpha: 1,
    }));

    let raf;
    let start = null;
    const duration = 2000;

    function draw(ts) {
      if (!start) start = ts;
      const elapsed = ts - start;
      const progress = Math.min(elapsed / duration, 1);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.vy += 0.45; // gravity
        p.vx *= 0.99; // air drag
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.rotV;
        p.alpha = Math.max(0, 1 - progress * 1.4);
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === "circle") {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === "strip") {
          ctx.fillRect(-p.w / 2, -p.h / 4, p.w, p.h / 2);
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      });
      if (progress < 1) raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} style={{
    position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999,
  }} />;
}

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
  const [activePerson, setActivePerson] = useState("Ben"); // Ben | Boone
  const [boardSort, setBoardSort] = useState("added"); // added | due | updated
  const [boardSearch, setBoardSearch] = useState("");
  const [confettiId, setConfettiId] = useState(null);
  const confettiRef = useRef(null);
  const [showImport, setShowImport] = useState(false);
  const [importError, setImportError] = useState("");
  const [focusedCardId, setFocusedCardId] = useState(null);
  const saveTimer = useRef(null);
  const importFileRef = useRef(null);
  const boardSearchRef = useRef(null);
  const doneSearchRef = useRef(null);
  const boardColumnsRef = useRef([]);

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

  // ── Keyboard shortcuts ──────────────────────────────────────────────
  const modalOpen = showForm || !!flagTarget || !!confirmTarget || showImport;

  useEffect(() => {
    function onKeyDown(e) {
      const el = e.target;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);

      // Ctrl/Cmd+F → focus whichever search bar this view has
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        const ref = view === "board" ? boardSearchRef : view === "done" ? doneSearchRef : null;
        if (ref?.current) {
          e.preventDefault();
          ref.current.focus();
          ref.current.select();
        }
        return;
      }

      if (e.key === "Escape") {
        if (typing) {
          if (view === "board") { setBoardSearch(""); boardSearchRef.current?.blur(); }
          if (view === "done") { setDoneSearch(""); doneSearchRef.current?.blur(); }
        } else {
          setFocusedCardId(null);
        }
        return;
      }

      // Everything below is a bare letter/arrow shortcut — skip while typing,
      // while a modal is open, or when a modifier is held.
      if (typing || modalOpen || e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();

      if (key === "n") { e.preventDefault(); openNew(); return; }

      if (view !== "board") return;

      const cols = boardColumnsRef.current;
      const flat = cols.flatMap((c, ci) => c.items.map((p, ri) => ({ id: p.id, ci, ri, p })));
      if (flat.length === 0) return;
      const cur = flat.find((x) => x.id === focusedCardId) || null;

      if (key === "e" && cur) { e.preventDefault(); openEdit(cur.p); return; }

      if (key === "m" && cur) {
        e.preventDefault();
        const idx = STATUSES.indexOf(cur.p.status);
        const next = STATUSES[idx + 1];
        if (next) setStatus(cur.p, next);
        return;
      }

      const arrows = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      if (!arrows.includes(e.key)) return;
      e.preventDefault();

      if (!cur) { setFocusedCardId(flat[0].id); return; }

      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const col = cols[cur.ci].items;
        const nextRow = cur.ri + (e.key === "ArrowDown" ? 1 : -1);
        if (nextRow >= 0 && nextRow < col.length) setFocusedCardId(col[nextRow].id);
        return;
      }

      // Left/Right: hop columns, keeping roughly the same row, skipping empties
      const dir = e.key === "ArrowRight" ? 1 : -1;
      for (let ci = cur.ci + dir; ci >= 0 && ci < cols.length; ci += dir) {
        const col = cols[ci].items;
        if (col.length > 0) {
          setFocusedCardId(col[Math.min(cur.ri, col.length - 1)].id);
          return;
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view, focusedCardId, modalOpen, projects]);

  // Keep the focused card in view as you arrow around
  useEffect(() => {
    if (!focusedCardId) return;
    document.querySelector(`[data-card-id="${focusedCardId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedCardId]);

  // Card focus only means something on the board
  useEffect(() => {
    if (view !== "board") setFocusedCardId(null);
  }, [view]);

  const [copiedCode, setCopiedCode] = useState(null);

  const DYNAMICS_URL = "https://aellc.crm.dynamics.com/main.aspx?appid=134bf34e-1fd8-ef11-8eea-6045bdd871bf&forceUCI=1&pagetype=entitylist&etn=ae_project&viewid=f6702143-650b-45d3-9cec-d49d8bebbdb5&viewType=1039";

  function openDynamics(code) {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
    window.open(DYNAMICS_URL, "_blank", "noopener");
  }

  // Only close a modal when the press AND the release both happen on the
  // backdrop. Without this, selecting text inside the modal and releasing the
  // mouse outside it would close the modal and discard the draft.
  const backdropPressed = useRef(false);
  function backdropProps(closeFn) {
    return {
      onMouseDown: (e) => { backdropPressed.current = e.target === e.currentTarget; },
      onClick: (e) => {
        if (e.target === e.currentTarget && backdropPressed.current) closeFn();
        backdropPressed.current = false;
      },
    };
  }

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

  function exportData() {
    const json = JSON.stringify(projects, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `hydro-tracker-backup-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!Array.isArray(parsed)) throw new Error("File must contain an array of projects.");
        // Normalise old "Benjamin" owner to "Ben"
        const normalised = parsed.map((p) => ({
          ...p,
          owner: p.owner === "Benjamin" ? "Ben" : p.owner,
        }));
        persist(normalised);
        setShowImport(false);
        setImportError("");
      } catch (err) {
        setImportError(err.message || "Couldn't parse that file.");
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-selected if needed
    e.target.value = "";
  }

  function openNew() {
    setDraft({ ...emptyDraft(), due: defaultDueTime(), owner: activePerson });
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
      const prev = projects.find((p) => p.id === editingId);
      const statusChanged = prev && prev.status !== draft.status;
      if (statusChanged && draft.status === "Done") setConfettiId(editingId);
      persist(projects.map((p) => (p.id === editingId
        ? { ...draft, due: dueISO, updatedAt: nowISO, statusChangedAt: statusChanged ? nowISO : (p.statusChangedAt || nowISO) }
        : p)));
    } else {
      persist([...projects, { ...draft, due: dueISO, id: uid(), updatedAt: nowISO, statusChangedAt: nowISO }]);
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

  useEffect(() => {
    if (!confettiId) return;
    const t = setTimeout(() => setConfettiId(null), 2200);
    return () => clearTimeout(t);
  }, [confettiId]);

  function setStatus(p, status) {
    if (status === p.status) return;
    if (status === "Done") setConfettiId(p.id);
    const nowISO = new Date().toISOString();
    persist(projects.map((x) => (x.id === p.id ? { ...x, status, updatedAt: nowISO, statusChangedAt: nowISO } : x)));
  }

  if (loading || projects === null) {
    return (
      <div className="tr-root tr-center">
        <Loader2 className="tr-spin" size={22} />
      </div>
    );
  }

  const visibleProjects = projects.filter((p) => p.owner === activePerson || p.owner === "Both");

  const flaggedUrgent = visibleProjects.filter((p) => {
    const d = fmtDue(p.due);
    return p.flagged || (d && (d.urgent || d.overdue) && p.status !== "Done");
  });

  // ── Board columns (hoisted so keyboard nav can read the same layout) ──
  const q = boardSearch.trim().toLowerCase();
  const boardColumns = BOARD_STATUSES.map((status) => {
    const rawItems = visibleProjects
      .filter((p) => p.status === status)
      .filter((p) => !q
        || p.title.toLowerCase().includes(q)
        || (p.notes || "").toLowerCase().includes(q)
        || (p.projectCode || "").toLowerCase().includes(q));
    const items = [...rawItems].sort((a, b) => {
      if (boardSort === "due") {
        if (!a.due && !b.due) return 0;
        if (!a.due) return 1;
        if (!b.due) return -1;
        return new Date(a.due) - new Date(b.due);
      }
      if (boardSort === "updated") {
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      }
      return 0; // "added" keeps insertion order
    });
    return { status, items };
  });
  boardColumnsRef.current = boardColumns;

  // ── Scoreboard: projects closed this calendar month ──────────────────
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const closedThisMonth = projects.filter(
    (p) => p.status === "Done" && p.updatedAt && new Date(p.updatedAt) >= monthStart
  );
  const benScore = closedThisMonth.filter((p) => p.owner === "Ben" || p.owner === "Both").length;
  const booneScore = closedThisMonth.filter((p) => p.owner === "Boone" || p.owner === "Both").length;
  const scoreMax = Math.max(benScore, booneScore, 1);
  const monthName = now.toLocaleDateString(undefined, { month: "long" });

  // ── This Week digest: everything due in the next 7 days, both people ──
  const weekCutoff = Date.now() + 7 * 86400000;
  const weekItems = projects
    .filter((p) => p.status !== "Done" && p.due && new Date(p.due).getTime() <= weekCutoff)
    .sort((a, b) => new Date(a.due) - new Date(b.due));
  const weekGroups = [];
  weekItems.forEach((p) => {
    const label = dayLabel(p.due);
    const last = weekGroups[weekGroups.length - 1];
    if (last && last.label === label) last.items.push(p);
    else weekGroups.push({ label, items: [p] });
  });

  return (
    <div className="tr-root">
      <style>{css}</style>

      <header className="tr-header">
        <div className="tr-title-block">
          <div className="tr-eyebrow">Johnson Barrow &middot; Project Log</div>
          <h1>Hydro Tracker</h1>
        </div>
        <div className="tr-header-right">
          <button className="tr-export-btn" onClick={() => { setImportError(""); setShowImport(true); }} title="Import a backup JSON">
            ↑ Import
          </button>
          <button className="tr-export-btn" onClick={exportData} title="Export backup as JSON">
            ↓ Export
          </button>
          <div className="tr-header-status">
            <span className={"tr-dot" + (saveState === "saving" ? " tr-dot-saving" : "")} />
            {saveState === "saving" ? "Saving…" : "Synced"}
          </div>
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
        <div className="tr-toolbar-left">
          <div className="tr-tabs">
            <button className={"tr-tab" + (view === "board" ? " tr-tab-active" : "")} onClick={() => setView("board")}>
              Board
            </button>
            <button className={"tr-tab" + (view === "done" ? " tr-tab-active" : "")} onClick={() => setView("done")}>
              Done <span className="tr-count">{visibleProjects.filter((p) => p.status === "Done").length}</span>
            </button>
            <button className={"tr-tab" + (view === "week" ? " tr-tab-active" : "")} onClick={() => setView("week")}>
              This week <span className="tr-count">{weekItems.length}</span>
            </button>
          </div>
          {view !== "week" && (
            <button
              className="tr-person-toggle"
              onClick={() => setActivePerson(activePerson === "Ben" ? "Boone" : "Ben")}
              aria-label="Switch whose view you're viewing"
            >
              <span className={"tr-person-pill" + (activePerson === "Boone" ? " tr-person-pill-right" : "")} />
              <span className={activePerson === "Ben" ? "tr-person-active" : ""}>Ben</span>
              <span className={activePerson === "Boone" ? "tr-person-active" : ""}>Boone</span>
            </button>
          )}
        </div>
        {view === "board" && (
          <div className="tr-toolbar-right">
            <div className="tr-search">
              <Search size={14} />
              <input
                ref={boardSearchRef}
                placeholder={`Search ${activePerson}'s projects…`}
                value={boardSearch}
                onChange={(e) => setBoardSearch(e.target.value)}
              />
              {boardSearch && (
                <button className="tr-search-clear" onClick={() => setBoardSearch("")} title="Clear">
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="tr-sort-wrap">
              <span className="tr-sort-label">Sort</span>
              <select className="tr-sort-select" value={boardSort} onChange={(e) => setBoardSort(e.target.value)}>
                <option value="added">Date added</option>
                <option value="due">Due date</option>
                <option value="updated">Last updated</option>
              </select>
            </div>
            <button className="tr-btn-primary" onClick={openNew}>
              <Plus size={16} /> New project
            </button>
          </div>
        )}
        {view === "done" && (
          <div className="tr-search">
            <Search size={14} />
            <input
              ref={doneSearchRef}
              placeholder="Search done projects…"
              value={doneSearch}
              onChange={(e) => setDoneSearch(e.target.value)}
            />
            {doneSearch && (
              <button className="tr-search-clear" onClick={() => setDoneSearch("")} title="Clear">
                <X size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {view === "board" && (
      <div className="tr-board">
        {boardColumns.map(({ status, items }) => {
          return (
            <div className="tr-column" key={status}>
              <div className="tr-column-head">
                <span className="tr-pipe-dot" data-status={status} />
                {status}
                <span className="tr-count">{items.length}</span>
              </div>
              <div className="tr-column-body">
                {items.length === 0 && <div className="tr-empty">{boardSearch ? "No matches" : "Nothing here"}</div>}
                {items.map((p) => {
                  const d = fmtDue(p.due);
                  const u = fmtUpdated(p.updatedAt);
                  const st = fmtInStatus(p);
                  const isBlindSpot = p.flagged || (d && (d.urgent || d.overdue) && p.status !== "Done");
                  return (
                    <div
                      className={"tr-card" + (isBlindSpot ? " tr-card-flagged" : "") + (focusedCardId === p.id ? " tr-card-focused" : "")}
                      key={p.id}
                      data-card-id={p.id}
                      onClick={() => setFocusedCardId(p.id)}
                    >
                      {isBlindSpot && (
                        <div className="tr-flag-tag">
                          <AlertTriangle size={11} />
                          {p.flagged ? p.flagReason : d.overdue ? "Overdue" : "Due soon"}
                        </div>
                      )}
                      <div className="tr-card-title" onClick={() => openEdit(p)}>{p.title}</div>
                      {p.projectCode && (
                        <button
                          className={"tr-code-badge" + (copiedCode === p.projectCode ? " tr-code-badge-copied" : "")}
                          onClick={() => openDynamics(p.projectCode)}
                          title="Open Dynamics 365 — code copied to clipboard"
                        >
                          {copiedCode === p.projectCode ? "✓ copied!" : p.projectCode}
                        </button>
                      )}
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
                        {st && (
                          <span className={"tr-instatus tr-instatus-" + st.level} title={`In "${p.status}" for ${st.days} day${st.days > 1 ? "s" : ""}`}>
                            {st.days}d
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

      {view === "week" && (
        <div className="tr-week">
          {/* ── Hydronic manifold: monthly throughput ── */}
          <div className="tr-manifold">
            <div className="tr-manifold-head">
              <span className="tr-manifold-gauge" aria-hidden="true">
                <span className="tr-manifold-needle" style={{ transform: `rotate(${-50 + Math.min((benScore + booneScore) / 20, 1) * 100}deg)` }} />
              </span>
              <span className="tr-manifold-title">Monthly throughput</span>
              <span className="tr-manifold-month">{monthName}</span>
            </div>

            <div className="tr-manifold-body">
              {[
                { name: "Ben", score: benScore },
                { name: "Boone", score: booneScore },
              ].map(({ name, score }) => {
                const leading = score === scoreMax && score > 0;
                const pct = (score / scoreMax) * 100;
                return (
                  <div className={"tr-circuit" + (leading ? " tr-circuit-lead" : "")} key={name}>
                    <span className="tr-circuit-label">{name}</span>
                    <span className="tr-pipe">
                      <span className="tr-pipe-cap tr-pipe-cap-in" />
                      <span className="tr-pipe-bore">
                        <span className="tr-pipe-water" style={{ width: `${pct}%` }}>
                          <span className="tr-pipe-flow" />
                        </span>
                        <span className="tr-pipe-ticks" />
                      </span>
                      <span className="tr-pipe-cap tr-pipe-cap-out" />
                    </span>
                    <span className="tr-circuit-readout">
                      {score}
                      {leading && <span className="tr-circuit-lead-dot" title="Leading" />}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="tr-manifold-foot">
              <span>Projects closed this month</span>
              {benScore === booneScore && benScore > 0 && <span className="tr-manifold-tag">balanced flow</span>}
            </div>
          </div>

          <div className="tr-week-intro">
            Due in the next 7 days &mdash; Ben and Boone combined.
          </div>

          {weekGroups.length === 0 && (
            <div className="tr-empty tr-empty-lg">Nothing due in the next 7 days.</div>
          )}
          {weekGroups.map((g) => (
            <div className="tr-week-group" key={g.label}>
              <div className={"tr-week-dayhead" + (g.label === "Overdue" ? " tr-week-dayhead-over" : "")}>
                {g.label}
                <span className="tr-count">{g.items.length}</span>
              </div>
              {g.items.map((p) => {
                const d = fmtDue(p.due);
                const st = fmtInStatus(p);
                return (
                  <div className="tr-weekrow" key={p.id}>
                    <span className="tr-pipe-dot" data-status={p.status} />
                    <div className="tr-weekrow-main">
                      <div className="tr-weekrow-title" onClick={() => { setView("board"); setFocusedCardId(p.id); openEdit(p); }}>
                        {p.title}
                      </div>
                      <div className="tr-weekrow-meta">
                        <span className="tr-owner">
                          {p.owner === "Both" ? <Users size={12} /> : <User size={12} />}
                          {p.owner}
                        </span>
                        <span className="tr-weekrow-status">{p.status}</span>
                        {st && <span className={"tr-instatus tr-instatus-" + st.level}>{st.days}d</span>}
                        {p.projectCode && (
                          <button
                            className={"tr-code-badge" + (copiedCode === p.projectCode ? " tr-code-badge-copied" : "")}
                            onClick={() => openDynamics(p.projectCode)}
                            title="Open Dynamics 365 — code copied to clipboard"
                          >
                            {copiedCode === p.projectCode ? "✓ copied!" : p.projectCode}
                          </button>
                        )}
                      </div>
                    </div>
                    {d && (
                      <span className={"tr-weekrow-due" + (d.overdue ? " tr-due-over" : d.urgent ? " tr-due-urgent" : "")}>
                        {d.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {view === "done" && (() => {
        const doneItems = visibleProjects
          .filter((p) => p.status === "Done")
          .filter((p) => p.title.toLowerCase().includes(doneSearch.trim().toLowerCase()) || (p.projectCode || "").toLowerCase().includes(doneSearch.trim().toLowerCase()))
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
                      {p.projectCode && (
                        <button
                          className={"tr-code-badge" + (copiedCode === p.projectCode ? " tr-code-badge-copied" : "")}
                          onClick={() => openDynamics(p.projectCode)}
                          title="Open Dynamics 365 — code copied to clipboard"
                        >
                          {copiedCode === p.projectCode ? "✓ copied!" : p.projectCode}
                        </button>
                      )}
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
        <div className="tr-modal-backdrop" {...backdropProps(() => setShowForm(false))}>
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
            <div className="tr-field-row">
              <label className="tr-field">
                <span>Project code <span className="tr-field-hint">XXXX-XXXX</span></span>
                <input
                  value={draft.projectCode || ""}
                  onChange={(e) => {
                    let v = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
                    if (v.length === 4 && (draft.projectCode || "").length === 3) v = v + "-";
                    if (v.length > 9) v = v.slice(0, 9);
                    setDraft({ ...draft, projectCode: v });
                  }}
                  placeholder="e.g. 1234-5678"
                  maxLength={9}
                  className="tr-code-input"
                />
              </label>
              <label className="tr-field">
                <span>Due</span>
                <input
                  type="datetime-local"
                  value={draft.due}
                  onChange={(e) => setDraft({ ...draft, due: e.target.value })}
                />
              </label>
            </div>
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
        <div className="tr-modal-backdrop" {...backdropProps(() => setFlagTarget(null))}>
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
        <div className="tr-modal-backdrop" {...backdropProps(() => setConfirmTarget(null))}>
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

      {showImport && (
        <div className="tr-modal-backdrop" {...backdropProps(() => setShowImport(false))}>
          <div className="tr-modal tr-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="tr-modal-head">
              <h2>Import backup</h2>
              <button className="tr-close" onClick={() => setShowImport(false)}><X size={18} /></button>
            </div>
            <p className="tr-modal-subtitle">
              Choose a <code>.json</code> file exported from Hydro Tracker. This will <strong>replace</strong> all current projects on the board.
            </p>
            {importError && (
              <div className="tr-errorbar" style={{marginBottom: "12px"}}>
                <AlertTriangle size={14} /> {importError}
              </div>
            )}
            <input
              ref={importFileRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={handleImportFile}
            />
            <div className="tr-modal-actions">
              <button className="tr-btn-ghost" onClick={() => setShowImport(false)}>Cancel</button>
              <button className="tr-btn-primary" onClick={() => importFileRef.current?.click()}>
                Choose file…
              </button>
            </div>
          </div>
        </div>
      )}

      {confettiId && <ConfettiBurst />}

      <footer className="tr-footer">
        <div>Shared board — changes sync for everyone with this link.</div>
        <div className="tr-footer-keys">
          <kbd>N</kbd> new · <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> move focus · <kbd>E</kbd> edit · <kbd>M</kbd> next stage · <kbd>Ctrl</kbd>+<kbd>F</kbd> search
        </div>
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
  --water: #3D7EA6;
  --water-light: #74B4D0;
  font-family: 'IBM Plex Sans', sans-serif;
  background: var(--paper);
  background-image:
    linear-gradient(var(--line) 1px, transparent 1px),
    linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 32px 32px;
  background-position: -1px -1px;
  color: var(--ink);
  min-height: 100vh;
  padding: 28px 32px;
  box-sizing: border-box;
}
.tr-root * { box-sizing: border-box; }
.tr-center { display: flex; align-items: center; justify-content: center; }
.tr-spin { animation: tr-spin 1s linear infinite; color: var(--copper); }
@keyframes tr-spin { to { transform: rotate(360deg); } }

/* ── Header ─────────────────────────────────────── */
.tr-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid var(--ink);
  padding-bottom: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}
.tr-eyebrow {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--copper);
  text-transform: uppercase;
  margin-bottom: 3px;
}
.tr-header h1 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 28px;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.02em;
  line-height: 1;
}
.tr-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tr-header-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  color: var(--muted);
  padding: 0 4px;
}
.tr-export-btn {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  font-weight: 500;
  background: none;
  border: 1px solid var(--line);
  color: var(--muted);
  padding: 6px 11px;
  border-radius: 6px;
  cursor: pointer;
  letter-spacing: 0.03em;
  transition: border-color 0.15s, color 0.15s;
}
.tr-export-btn:hover { border-color: var(--ink); color: var(--ink); }
.tr-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--ok);
  flex-shrink: 0;
}
.tr-dot-saving { background: var(--copper); }

/* ── Alerts ─────────────────────────────────────── */
.tr-alertbar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #FDF0ED;
  border: 1px solid #EAC0B8;
  color: var(--alert);
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  margin-bottom: 16px;
}
.tr-errorbar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #3A2420;
  border: 1px solid #6B342B;
  color: #F3D9D3;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  margin-bottom: 16px;
}

/* ── Toolbar ─────────────────────────────────────── */
.tr-toolbar {
  margin-bottom: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}
.tr-toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.tr-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tr-tabs { display: flex; gap: 3px; }
.tr-tab {
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 13px;
  font-weight: 600;
  background: none;
  border: 1px solid var(--line);
  color: var(--muted);
  padding: 7px 14px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  height: 36px;
}
.tr-tab:hover:not(.tr-tab-active) { border-color: var(--ink); color: var(--ink); }
.tr-tab-active { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.tr-tab .tr-count { color: inherit; opacity: 0.6; }
.tr-person-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  background: var(--paper-card);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px;
  cursor: pointer;
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 12px;
  font-weight: 600;
  height: 36px;
}
.tr-person-toggle span:not(.tr-person-pill) {
  position: relative;
  z-index: 1;
  padding: 0;
  width: 54px;
  text-align: center;
  color: var(--muted);
  transition: color 0.15s;
  line-height: 1;
}
.tr-person-active { color: var(--paper) !important; }
.tr-person-pill {
  position: absolute;
  top: 3px; left: 3px; bottom: 3px;
  width: 54px;
  background: var(--ink);
  border-radius: 999px;
  transition: transform 0.2s ease;
}
.tr-person-pill-right { transform: translateX(54px); }
.tr-search {
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--paper-card);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0 10px;
  color: var(--muted);
  height: 36px;
  min-width: 200px;
  transition: border-color 0.15s;
}
.tr-search:focus-within { border-color: var(--ink); }
.tr-search input {
  border: none;
  outline: none;
  background: none;
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 13px;
  color: var(--ink);
  width: 100%;
}
.tr-search input::placeholder { color: var(--muted); }
.tr-search-clear {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--muted);
  display: flex;
  align-items: center;
  padding: 0;
  flex-shrink: 0;
  transition: color 0.15s;
}
.tr-search-clear:hover { color: var(--ink); }
.tr-sort-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--paper-card);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0 10px;
  height: 36px;
  transition: border-color 0.15s;
}
.tr-sort-wrap:focus-within { border-color: var(--ink); }
.tr-sort-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: var(--muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}
.tr-sort-select {
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
  background: none;
  border: none;
  outline: none;
  cursor: pointer;
  padding: 0;
}

/* ── Board ───────────────────────────────────────── */
.tr-board {
  display: grid;
  grid-template-columns: repeat(3, minmax(220px, 1fr));
  gap: 16px;
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
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0 0 10px 0;
  border-bottom: 2px solid var(--ink);
  margin-bottom: 12px;
}
.tr-pipe-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--muted);
  flex-shrink: 0;
}
.tr-pipe-dot[data-status="In progress"] { background: var(--ok); }
.tr-pipe-dot[data-status="Waiting on reply"] { background: var(--copper); }
.tr-count {
  margin-left: auto;
  font-family: 'IBM Plex Mono', monospace;
  color: var(--muted);
  font-size: 11px;
  font-weight: 400;
}
.tr-column-body { display: flex; flex-direction: column; gap: 8px; min-height: 40px; }
.tr-empty {
  font-size: 12px;
  color: var(--muted);
  font-style: italic;
  padding: 12px 2px;
}

/* ── Cards ───────────────────────────────────────── */
.tr-card {
  background: var(--paper-card);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 13px 14px 11px;
  position: relative;
  transition: box-shadow 0.15s;
}
.tr-card:hover { box-shadow: 0 2px 8px rgba(22,35,61,0.07); }
.tr-card-flagged {
  border-color: var(--alert);
  border-left: 3px solid var(--alert);
}
.tr-flag-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #FDF0ED;
  color: var(--alert);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 3px 7px;
  border-radius: 4px;
  margin-bottom: 9px;
}
.tr-card-title {
  font-weight: 600;
  font-size: 13.5px;
  cursor: pointer;
  line-height: 1.4;
  margin-bottom: 0;
  transition: color 0.15s;
}
.tr-card-title:hover { color: var(--copper); }
.tr-code-badge {
  display: inline-flex;
  align-items: center;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.08em;
  background: #EEF3FA;
  color: #3A5A8C;
  border: 1px solid #C8D8EE;
  border-radius: 4px;
  padding: 2px 7px;
  cursor: pointer;
  margin: 6px 0 2px;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  white-space: nowrap;
}
.tr-code-badge:hover { background: var(--ink); color: #E8F0FF; border-color: var(--ink); }
.tr-code-badge-copied { background: var(--ok) !important; color: #fff !important; border-color: var(--ok) !important; }
.tr-card-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  font-size: 11.5px;
  color: var(--muted);
  margin-top: 7px;
}
.tr-owner, .tr-due { display: flex; align-items: center; gap: 4px; }
.tr-due-urgent { color: var(--copper); font-weight: 600; }
.tr-due-over { color: var(--alert); font-weight: 600; }
.tr-card-notes {
  font-size: 11.5px;
  color: var(--muted);
  margin-top: 7px;
  line-height: 1.45;
}
.tr-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  padding-top: 9px;
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
  gap: 4px;
  margin-left: auto;
}
.tr-status-select {
  font-size: 11px;
  font-family: 'IBM Plex Sans', sans-serif;
  border: 1px solid var(--line);
  background: var(--paper);
  color: var(--muted);
  border-radius: 5px;
  padding: 4px 6px;
  max-width: 112px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.tr-status-select:hover { border-color: var(--ink); color: var(--ink); }
.tr-flag-btn, .tr-del-btn {
  border: none;
  background: none;
  border-radius: 5px;
  padding: 4px 5px;
  cursor: pointer;
  color: #B0BAC8;
  display: flex;
  transition: color 0.15s, background 0.15s;
}
.tr-flag-btn-on { color: var(--alert); }
.tr-flag-btn:hover { color: var(--alert); background: #FDF0ED; }
.tr-del-btn:hover { color: var(--alert); background: #FDF0ED; }

/* ── Done list ───────────────────────────────────── */
.tr-donelist {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 680px;
}
.tr-empty-lg { padding: 32px 4px; text-align: center; color: var(--muted); font-size: 13px; }
.tr-donerow {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--paper-card);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 11px 14px;
  transition: box-shadow 0.15s;
}
.tr-donerow:hover { box-shadow: 0 1px 6px rgba(22,35,61,0.06); }
.tr-done-check { color: var(--ok); flex-shrink: 0; }
.tr-donerow-main { flex: 1; min-width: 0; }
.tr-donerow-title {
  font-weight: 600;
  font-size: 13.5px;
  cursor: pointer;
  transition: color 0.15s;
}
.tr-donerow-title:hover { color: var(--copper); }
.tr-donerow-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11.5px;
  color: var(--muted);
  margin-top: 3px;
  flex-wrap: wrap;
}
.tr-donerow-meta .tr-owner { display: inline-flex; align-items: center; gap: 4px; }

/* ── Buttons ─────────────────────────────────────── */
.tr-btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--ink);
  color: var(--paper);
  border: none;
  padding: 0 16px;
  height: 36px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: 'IBM Plex Sans', sans-serif;
  transition: background 0.15s;
  white-space: nowrap;
}
.tr-btn-primary:hover { background: var(--copper); }
.tr-btn-ghost {
  background: none;
  border: 1px solid var(--line);
  color: var(--muted);
  padding: 0 14px;
  height: 36px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  font-family: 'IBM Plex Sans', sans-serif;
  transition: border-color 0.15s, color 0.15s;
}
.tr-btn-ghost:hover { color: var(--ink); border-color: var(--ink); }
.tr-btn-danger {
  background: none;
  border: 1px solid var(--alert);
  color: var(--alert);
  padding: 0 14px;
  height: 36px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  font-family: 'IBM Plex Sans', sans-serif;
  transition: background 0.15s;
}
.tr-btn-danger:hover { background: #FDF0ED; }
.tr-btn-danger-solid {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--alert);
  color: #fff;
  border-color: var(--alert);
}
.tr-btn-danger-solid:hover { background: #962e28; }

/* ── Modals ──────────────────────────────────────── */
.tr-modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(22, 35, 61, 0.4);
  backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  z-index: 10;
}
.tr-modal {
  background: var(--paper-card);
  border-radius: 10px;
  border: 1px solid var(--line);
  padding: 24px;
  width: 100%;
  max-width: 440px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(22,35,61,0.14);
}
.tr-modal-sm { max-width: 360px; }
.tr-modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}
.tr-modal-head h2 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 17px;
  font-weight: 600;
  margin: 0;
}
.tr-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--muted);
  padding: 4px;
  border-radius: 5px;
  display: flex;
  transition: color 0.15s, background 0.15s;
}
.tr-close:hover { color: var(--ink); background: var(--paper); }
.tr-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--muted);
  letter-spacing: 0.02em;
  margin-bottom: 14px;
}
.tr-field-row { display: flex; gap: 12px; }
.tr-field-row .tr-field { flex: 1; }
.tr-field input, .tr-field select, .tr-field textarea {
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 13.5px;
  color: var(--ink);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 9px 10px;
  resize: vertical;
  transition: border-color 0.15s;
}
.tr-field input:focus, .tr-field select:focus, .tr-field textarea:focus {
  outline: none;
  border-color: var(--ink);
}
.tr-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
}
.tr-modal-subtitle {
  font-size: 13px;
  color: var(--muted);
  margin: -4px 0 16px;
  line-height: 1.5;
}
.tr-code-input {
  font-family: 'IBM Plex Mono', monospace !important;
  letter-spacing: 0.08em;
}
.tr-field-hint {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: var(--muted);
  font-weight: 400;
  margin-left: 4px;
  letter-spacing: 0.04em;
  opacity: 0.7;
}

/* ── Hydronic manifold scoreboard ────────────────── */
.tr-manifold {
  background: linear-gradient(170deg, #FFFFFF 0%, #F7FAFC 100%);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 15px 18px 14px;
  margin-bottom: 18px;
  box-shadow: 0 1px 4px rgba(22,35,61,0.04);
  position: relative;
  overflow: hidden;
}
.tr-manifold::before {
  content: "";
  position: absolute;
  left: 0; right: 0; top: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--copper) 0%, #D8934F 40%, var(--water) 100%);
}
.tr-manifold-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 15px;
}
.tr-manifold-gauge {
  position: relative;
  width: 16px; height: 16px;
  border-radius: 50%;
  border: 1.5px solid var(--line);
  background: var(--paper-card);
  flex-shrink: 0;
}
.tr-manifold-needle {
  position: absolute;
  left: 50%; bottom: 50%;
  width: 1.5px; height: 5.5px;
  background: var(--copper);
  border-radius: 1px;
  transform-origin: bottom center;
  transition: transform 0.6s cubic-bezier(0.3, 1.4, 0.5, 1);
}
.tr-manifold-title {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--ink);
}
.tr-manifold-month {
  margin-left: auto;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}
.tr-manifold-body {
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.tr-circuit {
  display: flex;
  align-items: center;
  gap: 12px;
}
.tr-circuit-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  width: 46px;
  flex-shrink: 0;
}
.tr-circuit-lead .tr-circuit-label { color: var(--ink); }

/* the pipe run */
.tr-pipe {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
}
.tr-pipe-cap {
  width: 5px;
  height: 15px;
  background: linear-gradient(180deg, #D8A87C, #B5793F 45%, #8E5A2C);
  flex-shrink: 0;
}
.tr-pipe-cap-in { border-radius: 3px 1px 1px 3px; }
.tr-pipe-cap-out { border-radius: 1px 3px 3px 1px; }
.tr-pipe-bore {
  flex: 1;
  position: relative;
  height: 11px;
  background: #E9EEF3;
  border-top: 1px solid #D3DBE4;
  border-bottom: 1px solid #D3DBE4;
  overflow: hidden;
  min-width: 0;
}
.tr-pipe-water {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  background: linear-gradient(180deg, var(--water-light), var(--water));
  transition: width 0.7s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}
.tr-pipe-water::after {
  content: "";
  position: absolute;
  right: 0; top: 0; bottom: 0;
  width: 2px;
  background: rgba(255,255,255,0.55);
}
.tr-pipe-flow {
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(
    115deg,
    rgba(255,255,255,0.22) 0px,
    rgba(255,255,255,0.22) 2px,
    transparent 2px,
    transparent 9px
  );
  background-size: 18px 100%;
  animation: tr-flow 1.1s linear infinite;
}
@keyframes tr-flow { to { background-position: 18px 0; } }
.tr-pipe-ticks {
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(
    90deg,
    transparent 0px,
    transparent 23px,
    rgba(22,35,61,0.14) 23px,
    rgba(22,35,61,0.14) 24px
  );
  pointer-events: none;
}
.tr-circuit-readout {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: var(--muted);
  min-width: 30px;
  justify-content: flex-end;
  flex-shrink: 0;
}
.tr-circuit-lead .tr-circuit-readout { color: var(--ink); }
.tr-circuit-lead-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--copper);
  flex-shrink: 0;
}
.tr-manifold-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 13px;
  padding-top: 11px;
  border-top: 1px dashed var(--line);
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}
.tr-manifold-tag {
  margin-left: auto;
  color: var(--water);
  background: #E7F1F6;
  border-radius: 999px;
  padding: 2px 7px;
  letter-spacing: 0.06em;
}

/* ── Card focus ring (keyboard nav) ──────────────── */
.tr-card-focused {
  border-color: var(--ink);
  box-shadow: 0 0 0 2px rgba(22,35,61,0.16);
}

/* ── Time in status chip ─────────────────────────── */
.tr-instatus {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0.04em;
  padding: 2px 5px;
  border-radius: 4px;
  white-space: nowrap;
  background: var(--paper);
  color: #9AA5B8;
  border: 1px solid var(--line);
}
.tr-instatus-warn {
  background: #FBEFE5;
  color: var(--copper);
  border-color: #EBD3BE;
}
.tr-instatus-alert {
  background: #FDF0ED;
  color: var(--alert);
  border-color: #EAC0B8;
  font-weight: 600;
}

/* ── This Week digest ────────────────────────────── */
.tr-week { max-width: 720px; }
.tr-week-intro {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 14px;
}
.tr-week-group { margin-bottom: 18px; }
.tr-week-group:last-child { margin-bottom: 0; }
.tr-week-dayhead {
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 600;
  font-size: 11.5px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ink);
  padding-bottom: 8px;
  border-bottom: 2px solid var(--ink);
  margin-bottom: 8px;
}
.tr-week-dayhead-over {
  color: var(--alert);
  border-bottom-color: var(--alert);
}
.tr-weekrow {
  display: flex;
  align-items: center;
  gap: 11px;
  background: var(--paper-card);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 11px 14px;
  margin-bottom: 6px;
  transition: box-shadow 0.15s;
}
.tr-weekrow:last-child { margin-bottom: 0; }
.tr-weekrow:hover { box-shadow: 0 1px 6px rgba(22,35,61,0.06); }
.tr-weekrow-main { flex: 1; min-width: 0; }
.tr-weekrow-title {
  font-weight: 600;
  font-size: 13.5px;
  cursor: pointer;
  transition: color 0.15s;
}
.tr-weekrow-title:hover { color: var(--copper); }
.tr-weekrow-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  font-size: 11.5px;
  color: var(--muted);
  margin-top: 4px;
}
.tr-weekrow-meta .tr-owner { display: inline-flex; align-items: center; gap: 4px; }
.tr-weekrow-meta .tr-code-badge { margin: 0; }
.tr-weekrow-status {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.tr-weekrow-due {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Footer ──────────────────────────────────────── */
.tr-footer {
  margin-top: 28px;
  text-align: center;
  font-size: 11px;
  color: var(--muted);
  font-family: 'IBM Plex Mono', monospace;
  display: flex;
  flex-direction: column;
  gap: 7px;
  align-items: center;
}
.tr-footer > div:first-child { opacity: 0.6; }
.tr-footer-keys {
  font-size: 10px;
  color: var(--muted);
  opacity: 0.75;
  display: flex;
  align-items: center;
  gap: 3px;
  flex-wrap: wrap;
  justify-content: center;
}
.tr-footer-keys kbd {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9.5px;
  background: var(--paper-card);
  border: 1px solid var(--line);
  border-bottom-width: 2px;
  border-radius: 4px;
  padding: 1px 4px;
  color: var(--ink);
  margin: 0 1px;
}

/* ── Confetti canvas ─────────────────────────────── */
`;

