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

function MonthTree() {
  const now = new Date();
  const day = now.getDate(); // 1–31
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  // t goes 0→1 across the month. On day 1 it's a fresh sapling.
  const t = (day - 1) / (daysInMonth - 1);

  // ── geometry helpers ──────────────────────────────────────────────
  const W = 64, H = 72;
  const cx = W / 2;
  const groundY = H - 6;

  // Trunk: grows from stubby to tall
  const trunkH = 10 + t * 28;
  const trunkW = 2.5 + t * 1.5;
  const trunkTop = groundY - trunkH;

  // Canopy: three layered triangles that scale up
  const canopyLayers = [
    { yFrac: 0.0, wFrac: 1.00, hFrac: 0.55 },
    { yFrac: 0.3, wFrac: 0.80, hFrac: 0.52 },
    { yFrac: 0.55, wFrac: 0.60, hFrac: 0.48 },
  ];

  const maxCanopyH = trunkH * 1.15;
  const maxCanopyW = 38;
  const canopyScale = 0.15 + t * 0.85; // starts tiny, reaches full

  // Roots: two small arcs that spread with age
  const rootSpread = 3 + t * 6;
  const rootDepth = 2 + t * 3;

  // Color: slightly more saturated green as it grows
  const greenL = Math.round(38 + t * 14); // 38→52 lightness
  const leafColor = `hsl(150, ${Math.round(45 + t * 20)}%, ${greenL}%)`;
  const darkLeaf = `hsl(150, ${Math.round(40 + t * 20)}%, ${Math.round(28 + t * 10)}%)`;
  const trunkColor = `hsl(28, ${Math.round(35 + t * 15)}%, ${Math.round(30 + t * 8)}%)`;

  // ── build canopy triangles ─────────────────────────────────────────
  const canopyPaths = canopyLayers.map(({ yFrac, wFrac, hFrac }, i) => {
    const layerW = maxCanopyW * wFrac * canopyScale;
    const layerH = maxCanopyH * hFrac * canopyScale;
    const tipY = trunkTop - maxCanopyH * canopyScale * yFrac;
    const baseY = tipY + layerH;
    const overlap = i < canopyLayers.length - 1 ? layerH * 0.22 : 0;
    return (
      <polygon
        key={i}
        points={`${cx},${tipY - overlap} ${cx - layerW / 2},${baseY} ${cx + layerW / 2},${baseY}`}
        fill={i === 0 ? darkLeaf : leafColor}
        opacity={0.92 + i * 0.04}
      />
    );
  });

  // ── tooltip: day X of Y ───────────────────────────────────────────
  const ordinal = (n) => {
    const s = ["th","st","nd","rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  const tooltip = `${ordinal(day)} of ${daysInMonth} — ${Math.round(t * 100)}% through the month`;

  return (
    <svg
      width={W} height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="tr-month-tree"
      aria-label={tooltip}
      title={tooltip}
      style={{ display: "block", flexShrink: 0 }}
    >
      {/* Ground line */}
      <line x1={cx - 10} y1={groundY} x2={cx + 10} y2={groundY} stroke={trunkColor} strokeWidth="1.2" strokeLinecap="round" opacity="0.4" />

      {/* Roots */}
      {t > 0.05 && (
        <>
          <line x1={cx} y1={groundY} x2={cx - rootSpread} y2={groundY + rootDepth} stroke={trunkColor} strokeWidth="1" strokeLinecap="round" opacity="0.55" />
          <line x1={cx} y1={groundY} x2={cx + rootSpread} y2={groundY + rootDepth} stroke={trunkColor} strokeWidth="1" strokeLinecap="round" opacity="0.55" />
        </>
      )}

      {/* Trunk */}
      <rect
        x={cx - trunkW / 2}
        y={trunkTop}
        width={trunkW}
        height={trunkH}
        rx={trunkW / 2}
        fill={trunkColor}
      />

      {/* Canopy */}
      {canopyPaths}

      {/* Tiny star/sparkle on day 1 */}
      {day === 1 && (
        <text x={cx} y={trunkTop - maxCanopyH * canopyScale - 4} textAnchor="middle" fontSize="9" opacity="0.8">✦</text>
      )}

      {/* Full moon glow on last day */}
      {day === daysInMonth && (
        <circle cx={cx} cy={trunkTop - maxCanopyH * canopyScale - 7} r="4" fill="#F1A35A" opacity="0.7" />
      )}
    </svg>
  );
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
  const saveTimer = useRef(null);
  const importFileRef = useRef(null);
  const boardSearchRef = useRef(null);

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

  // Ctrl+F focuses the board search
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "f" && view === "board") {
        e.preventDefault();
        boardSearchRef.current?.focus();
        boardSearchRef.current?.select();
      }
      if (e.key === "Escape") {
        setBoardSearch("");
        boardSearchRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view]);

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

  useEffect(() => {
    if (!confettiId) return;
    const t = setTimeout(() => setConfettiId(null), 2200);
    return () => clearTimeout(t);
  }, [confettiId]);

  function setStatus(p, status) {
    if (status === "Done") setConfettiId(p.id);
    persist(projects.map((x) => (x.id === p.id ? { ...x, status, updatedAt: new Date().toISOString() } : x)));
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

  return (
    <div className="tr-root">
      <style>{css}</style>

      <header className="tr-header">
        <div className="tr-title-block">
          <div className="tr-eyebrow">Johnson Barrow &middot; Project Log</div>
          <div className="tr-title-row">
            <h1>Hydro Tracker</h1>
            <MonthTree />
          </div>
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
          </div>
          <button
            className="tr-person-toggle"
            onClick={() => setActivePerson(activePerson === "Ben" ? "Boone" : "Ben")}
            aria-label="Switch whose view you're viewing"
          >
            <span className={"tr-person-pill" + (activePerson === "Boone" ? " tr-person-pill-right" : "")} />
            <span className={activePerson === "Ben" ? "tr-person-active" : ""}>Ben</span>
            <span className={activePerson === "Boone" ? "tr-person-active" : ""}>Boone</span>
          </button>
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
        {BOARD_STATUSES.map((status) => {
          const rawItems = visibleProjects
            .filter((p) => p.status === status)
            .filter((p) => !boardSearch.trim() || p.title.toLowerCase().includes(boardSearch.trim().toLowerCase()) || (p.notes || "").toLowerCase().includes(boardSearch.trim().toLowerCase()));
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
        const doneItems = visibleProjects
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

      {showImport && (
        <div className="tr-modal-backdrop" onClick={() => setShowImport(false)}>
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
.tr-title-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}
.tr-month-tree {
  margin-bottom: 3px;
  opacity: 0.92;
  transition: opacity 0.2s;
}
.tr-month-tree:hover { opacity: 1; }
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
.tr-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 3px;
}
.tr-export-btn {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  font-weight: 500;
  background: none;
  border: 1px solid var(--line);
  color: var(--muted);
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
  letter-spacing: 0.03em;
}
.tr-export-btn:hover { border-color: var(--ink); color: var(--ink); }
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
.tr-toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
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
}
.tr-person-toggle span:not(.tr-person-pill) {
  position: relative;
  z-index: 1;
  padding: 6px 0;
  width: 56px;
  text-align: center;
  color: var(--muted);
  transition: color 0.15s;
}
.tr-person-active { color: var(--paper) !important; }
.tr-person-pill {
  position: absolute;
  top: 3px;
  left: 3px;
  bottom: 3px;
  width: 56px;
  background: var(--ink);
  border-radius: 999px;
  transition: transform 0.2s ease;
}
.tr-person-pill-right { transform: translateX(56px); }
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
.tr-pipe-dot[data-status="In progress"] { background: var(--ok); }
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

.tr-toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tr-sort-wrap {
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--paper-card);
  border: 1px solid var(--line);
  border-radius: 5px;
  padding: 5px 10px;
}
.tr-sort-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  color: var(--muted);
  letter-spacing: 0.04em;
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
.tr-sort-select:hover { color: var(--copper); }

.tr-footer {
  margin-top: 22px;
  text-align: center;
  font-size: 11px;
  color: var(--muted);
  font-family: 'IBM Plex Mono', monospace;
}

.tr-search-clear {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--muted);
  display: flex;
  align-items: center;
  padding: 0;
  flex-shrink: 0;
}
.tr-search-clear:hover { color: var(--ink); }
`;
