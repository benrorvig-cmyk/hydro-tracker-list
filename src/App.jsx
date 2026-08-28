import { useState, useEffect, useRef } from "react";
import { Plus, X, AlertTriangle, Clock, Check, User, Users, ChevronDown, Loader2, Search, ArrowLeft, Copy, Pencil } from "lucide-react";
import { getProjects, saveProjects, getPeople, savePeople } from "./storage";

const STATUSES = ["Not started", "In progress", "Waiting on reply", "Done"];
const BOARD_STATUSES = ["Not started", "In progress", "Waiting on reply"];
const DEFAULT_PEOPLE = ["Ben", "Boone"];

// Small localStorage helpers for per-device UI prefs (collapse state, sort).
// Wrapped in try/catch so private-mode or disabled storage never breaks the app.
function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full / unavailable — ignore, it's only a convenience
  }
}

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

  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const dayDiff = Math.round((startOfDay(due) - startOfDay(now)) / 86400000);

  const timeStr = due.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const dateStr = due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const weekday = due.toLocaleDateString(undefined, { weekday: "short" });

  // Prefer a plain-English day word for anything inside the next week
  let dayWord;
  if (dayDiff === 0) dayWord = "Today";
  else if (dayDiff === 1) dayWord = "Tomorrow";
  else if (dayDiff === -1) dayWord = "Yesterday";
  else if (dayDiff > 1 && dayDiff <= 6) dayWord = weekday;
  else dayWord = dateStr;

  // How late, in plain words
  let note = null;
  if (overdue) {
    const late = Math.abs(dayDiff);
    note = late === 0 ? "past due" : late === 1 ? "1 day late" : `${late} days late`;
  }

  return {
    overdue,
    urgent: !overdue && diffH <= 24,
    dayWord,
    timeStr,
    dateStr,
    note,
    label: `${dayWord}, ${timeStr}`,
    diffH,
    dayDiff,
  };
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

const PROJECT_KINDS = ["Proposal", "Submittal", "Release"];

const emptyDraft = () => ({
  id: null,
  title: "",
  owner: "Both",
  status: "Not started",
  due: "",
  notes: "",
  projectCode: "",
  kind: "",
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

function SettingsModal({ people, projects, onAdd, onRename, onRemove, onClose, backdropProps }) {
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState("");
  const [editing, setEditing] = useState(null); // name being renamed
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(null); // name pending removal
  const [removeText, setRemoveText] = useState("");

  const countFor = (name) => projects.filter((p) => p.owner === name).length;

  function submitAdd() {
    const res = onAdd(newName);
    if (res.ok) { setNewName(""); setAddError(""); }
    else setAddError(res.error);
  }
  function startEdit(name) {
    setEditing(name); setEditValue(name); setEditError("");
    setConfirmRemove(null);
  }
  function submitEdit() {
    const res = onRename(editing, editValue);
    if (res.ok) { setEditing(null); setEditError(""); }
    else setEditError(res.error);
  }

  return (
    <div className="tr-modal-backdrop" {...backdropProps(onClose)}>
      <div className="tr-modal tr-modal-settings" onClick={(e) => e.stopPropagation()}>
        <div className="tr-modal-head">
          <h2>Settings</h2>
          <button className="tr-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="tr-set-section">
          <h3>People</h3>
          <p className="tr-set-hint">
            Add teammates or rename them. Renaming updates every project they own. Removing someone reassigns their solo projects to “Both”.
          </p>

          <div className="tr-set-people">
            {people.map((name) => (
              <div className="tr-set-person" key={name}>
                {editing === name ? (
                  <div className="tr-set-editrow">
                    <input
                      autoFocus
                      className="tr-set-input"
                      value={editValue}
                      onChange={(e) => { setEditValue(e.target.value); setEditError(""); }}
                      onKeyDown={(e) => { if (e.key === "Enter") submitEdit(); if (e.key === "Escape") setEditing(null); }}
                    />
                    <button className="tr-btn-primary tr-set-save" onClick={submitEdit}>Save</button>
                    <button className="tr-btn-ghost tr-set-cancel" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                ) : confirmRemove === name ? (
                  <div className="tr-set-removebox">
                    <div className="tr-set-confirm-text">
                      Remove {name}?{countFor(name) > 0 && ` ${countFor(name)} project${countFor(name) > 1 ? "s" : ""} will move to “Both”.`}
                    </div>
                    <div className="tr-set-confirm-instruct">
                      Type <code>delete {name}</code> to confirm.
                    </div>
                    <div className="tr-set-editrow">
                      <input
                        autoFocus
                        className="tr-set-input"
                        placeholder={`delete ${name}`}
                        value={removeText}
                        onChange={(e) => setRemoveText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && removeText.trim().toLowerCase() === `delete ${name}`.toLowerCase()) {
                            onRemove(name); setConfirmRemove(null); setRemoveText("");
                          }
                          if (e.key === "Escape") { setConfirmRemove(null); setRemoveText(""); }
                        }}
                      />
                      <button
                        className="tr-btn-danger-solid tr-set-save"
                        disabled={removeText.trim().toLowerCase() !== `delete ${name}`.toLowerCase()}
                        onClick={() => { onRemove(name); setConfirmRemove(null); setRemoveText(""); }}
                      >
                        Remove
                      </button>
                      <button className="tr-btn-ghost tr-set-cancel" onClick={() => { setConfirmRemove(null); setRemoveText(""); }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="tr-set-name">
                      <span className="tr-set-avatar">{name.slice(0, 1).toUpperCase()}</span>
                      {name}
                      <span className="tr-set-count">{countFor(name)} owned</span>
                    </span>
                    <span className="tr-set-actions">
                      <button className="tr-icon-btn" onClick={() => startEdit(name)} title="Rename"><Pencil size={13} /></button>
                      <button
                        className="tr-icon-btn tr-del-btn"
                        onClick={() => { setConfirmRemove(name); setRemoveText(""); setEditing(null); }}
                        title="Remove"
                        disabled={people.length <= 1}
                      >
                        <X size={13} />
                      </button>
                    </span>
                  </>
                )}
                {editing === name && editError && <div className="tr-set-error">{editError}</div>}
              </div>
            ))}
          </div>

          <div className="tr-set-addrow">
            <input
              className="tr-set-input"
              placeholder="Add a person…"
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setAddError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") submitAdd(); }}
            />
            <button className="tr-btn-primary" onClick={submitAdd}><Plus size={15} /> Add</button>
          </div>
          {addError && <div className="tr-set-error">{addError}</div>}
        </div>

        <div className="tr-modal-actions">
          <button className="tr-btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

// Segmented control whose sliding pill is measured from the real button
// geometry, so options can size to their content (no truncation of short
// names, ellipsis only past a max width) and the pill always lines up.
function SegControl({ options, value, onChange, ariaLabel }) {
  const btnRefs = useRef({});
  const [pill, setPill] = useState({ left: 3, width: 0 });

  useEffect(() => {
    const el = btnRefs.current[value];
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, options.join("|")]);

  return (
    <div className="tr-seg" role="group" aria-label={ariaLabel}>
      <span className="tr-seg-pill" style={{ transform: `translateX(${pill.left}px)`, width: pill.width }} />
      {options.map((opt) => (
        <button
          key={opt}
          ref={(el) => { btnRefs.current[opt] = el; }}
          className={"tr-seg-btn" + (value === opt ? " tr-seg-btn-active" : "")}
          onClick={() => onChange(opt)}
          title={opt}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export default function HydroTracker() {
  const [projects, setProjects] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const [showForm, setShowForm] = useState(false);
  const [formFocus, setFormFocus] = useState(null); // which field to auto-open, e.g. "due"
  const dueInputRef = useRef(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [editingId, setEditingId] = useState(null);
  const [now, setNow] = useState(new Date());
  const [view, setView] = useState("board"); // board | done
  const [doneSearch, setDoneSearch] = useState("");
  const [flagTarget, setFlagTarget] = useState(null);
  const [flagReasonInput, setFlagReasonInput] = useState("");
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [storageError, setStorageError] = useState("");
  const [people, setPeople] = useState(DEFAULT_PEOPLE);
  const [activePerson, setActivePerson] = useState(() => lsGet("tracker-person-v1", DEFAULT_PEOPLE[0]));
  const [weekFilter, setWeekFilter] = useState("Both");
  const [showSettings, setShowSettings] = useState(false);
  const [boardSort, setBoardSort] = useState(() => lsGet("tracker-sort-v1", "added")); // added | due | updated | custom
  const [boardSearch, setBoardSearch] = useState("");
  const [confettiId, setConfettiId] = useState(null);
  const confettiRef = useRef(null);
  const [showImport, setShowImport] = useState(false);
  const [importError, setImportError] = useState("");
  const [focusedCardId, setFocusedCardId] = useState(null);
  const [collapsedIds, setCollapsedIds] = useState(() => new Set(lsGet("tracker-collapsed-v1", [])));
  const [showHelp, setShowHelp] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [dragGhost, setDragGhost] = useState(null); // { x, y, w, offsetX, offsetY, project, html }
  const dragState = useRef(null); // { id, status, longPressTimer, started }
  const justDragged = useRef(false);
  const saveTimer = useRef(null);
  const importFileRef = useRef(null);
  const boardSearchRef = useRef(null);
  const doneSearchRef = useRef(null);
  const boardColumnsRef = useRef([]);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(tick);
  }, []);

  // Remember the chosen sort, collapsed cards, and active person across reloads
  useEffect(() => { lsSet("tracker-sort-v1", boardSort); }, [boardSort]);
  useEffect(() => { lsSet("tracker-collapsed-v1", [...collapsedIds]); }, [collapsedIds]);
  useEffect(() => { if (activePerson) lsSet("tracker-person-v1", activePerson); }, [activePerson]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, storedPeople] = await Promise.all([getProjects(), getPeople()]);
        if (cancelled) return;

        // Seed the people list on first run from whoever already owns projects,
        // falling back to the Ben/Boone default.
        let ppl = storedPeople;
        if (!ppl || ppl.length === 0) {
          const fromProjects = [...new Set(list.map((p) => p.owner).filter((o) => o && o !== "Both"))];
          ppl = fromProjects.length ? fromProjects : DEFAULT_PEOPLE;
          try { await savePeople(ppl); } catch { /* non-fatal */ }
        }

        setProjects(list);
        setPeople(ppl);
        setActivePerson((cur) => (ppl.includes(cur) ? cur : ppl[0]));
        setStorageError("");
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
        const [list, ppl] = await Promise.all([getProjects(), getPeople()]);
        setProjects((prev) => (JSON.stringify(prev) !== JSON.stringify(list) ? list : prev));
        if (ppl && ppl.length) setPeople((prev) => (JSON.stringify(prev) !== JSON.stringify(ppl) ? ppl : prev));
        setStorageError("");
      } catch (e) {
        setStorageError(e.message || "Couldn't sync the board");
      }
    }, 15000);
    return () => clearInterval(poll);
  }, []);

  // ── Keyboard shortcuts ──────────────────────────────────────────────
  const modalOpen = showForm || !!flagTarget || !!confirmTarget || showImport;

  // Keyboard focus ring should fade after 5s of no keyboard navigation, so a
  // card isn't left permanently outlined. Mouse clicks set focus without the
  // ring (see card onClick), keyboard nav sets it with the ring + fade timer.
  const fadeTimer = useRef(null);
  function focusByKeyboard(id) {
    setFocusedCardId(id);
    clearTimeout(fadeTimer.current);
    if (id) fadeTimer.current = setTimeout(() => setFocusedCardId(null), 5000);
  }

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
          focusByKeyboard(null);
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

      if (!cur) { focusByKeyboard(flat[0].id); return; }

      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const col = cols[cur.ci].items;
        const nextRow = cur.ri + (e.key === "ArrowDown" ? 1 : -1);
        if (nextRow >= 0 && nextRow < col.length) focusByKeyboard(col[nextRow].id);
        return;
      }

      // Left/Right: hop columns, keeping roughly the same row, skipping empties
      const dir = e.key === "ArrowRight" ? 1 : -1;
      for (let ci = cur.ci + dir; ci >= 0 && ci < cols.length; ci += dir) {
        const col = cols[ci].items;
        if (col.length > 0) {
          focusByKeyboard(col[Math.min(cur.ri, col.length - 1)].id);
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
    if (view !== "board") { clearTimeout(fadeTimer.current); setFocusedCardId(null); }
  }, [view]);

  // When the form opens via a due-date click, jump straight to the calendar
  useEffect(() => {
    if (showForm && formFocus === "due" && dueInputRef.current) {
      const el = dueInputRef.current;
      el.focus();
      try { el.showPicker?.(); } catch { /* picker not supported; focus is enough */ }
    }
  }, [showForm, formFocus]);

  const [copiedField, setCopiedField] = useState(null); // `${id}:title` | `${id}:code`

  function copyToClipboard(text, fieldKey) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField((cur) => (cur === fieldKey ? null : cur)), 1400);
  }

  function copyCode(code, id) {
    copyToClipboard(code, `${id}:code`);
  }

  function toggleCollapse(id) {
    setCollapsedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Distinguish a single click (collapse) from a double click (edit) so the
  // card doesn't flicker collapsed-then-open on a double click.
  const clickTimer = useRef(null);
  function handleCardClick(p) {
    if (clickTimer.current) return; // second click of a dbl — let dblclick handle it
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      toggleCollapse(p.id);
    }, 200);
  }
  function handleCardDouble(p) {
    clearTimeout(clickTimer.current);
    clickTimer.current = null;
    openEdit(p);
  }

  // ── Long-press to drag-reorder cards within a column ────────────────
  // Press and hold ~450ms to pick a card up, then drag over siblings to
  // reorder. Releasing commits the new order and switches sort to "Custom".
  function seedOrderFromCurrent() {
    // Stamp `order` on each card to match the order currently shown, so
    // flipping to custom sort keeps the same starting arrangement.
    const cols = boardColumnsRef.current || [];
    const orderById = {};
    cols.forEach(({ items }) => {
      items.forEach((p, i) => { orderById[p.id] = i; });
    });
    setProjects((prev) => prev.map((p) =>
      orderById[p.id] != null ? { ...p, order: orderById[p.id] } : p
    ));
  }

  function reorderWithinStatus(status, draggedId, targetId) {
    setProjects((prev) => {
      const inCol = prev.filter((p) => p.status === status);
      const others = prev.filter((p) => p.status !== status);
      const from = inCol.findIndex((p) => p.id === draggedId);
      const to = inCol.findIndex((p) => p.id === targetId);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...inCol];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      // Stamp a fresh order value on every card in the column
      next.forEach((p, i) => { p.order = i; });
      return [...others, ...next];
    });
  }

  function commitOrder() {
    // Persist the latest order (reads current state, avoids stale closure)
    setBoardSort("custom");
    setProjects((cur) => {
      const snapshot = cur.map((p) => ({ ...p }));
      setSaveState("saving");
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          await saveProjects(snapshot);
          setSaveState("saved");
          setStorageError("");
          setTimeout(() => setSaveState("idle"), 1200);
        } catch (e) {
          setSaveState("idle");
          setStorageError(e.message || "Couldn't save — your last change may not have been kept");
        }
      }, 300);
      return cur;
    });
  }

  function cardPointerDown(e, p) {
    if (e.button === 2) return; // ignore right-click
    const startY = e.clientY, startX = e.clientX;
    const cardEl = e.currentTarget;
    dragState.current = { id: p.id, status: p.status, started: false, startX, startY, cardEl };

    const timer = setTimeout(() => {
      const ds = dragState.current;
      if (!ds) return;
      ds.started = true;

      // Snapshot the card's geometry so the floating clone matches it exactly
      const rect = ds.cardEl.getBoundingClientRect();
      ds.offsetX = ds.startX - rect.left;
      ds.offsetY = ds.startY - rect.top;
      ds.width = rect.width;
      ds.html = ds.cardEl.innerHTML;

      setDraggingId(p.id);
      setDragGhost({
        x: rect.left,
        y: rect.top,
        w: rect.width,
        html: ds.html,
        flagged: p.flagged,
        collapsed: collapsedIds.has(p.id),
      });

      // Kill text selection + set a grabbing cursor globally while dragging
      document.body.classList.add("tr-dragging-active");

      seedOrderFromCurrent();
      setBoardSort("custom");
      if (navigator.vibrate) navigator.vibrate(15);
    }, 450);
    dragState.current.timer = timer;

    const onMove = (ev) => {
      const ds = dragState.current;
      if (!ds) return;
      const cy = ev.clientY ?? ev.touches?.[0]?.clientY;
      const cx = ev.clientX ?? ev.touches?.[0]?.clientX;

      if (!ds.started) {
        // Moved too far before the hold completed → it's a scroll, cancel arm
        if (Math.abs(cy - ds.startY) > 8 || Math.abs(cx - ds.startX) > 8) {
          clearTimeout(ds.timer);
          dragState.current = null;
          cleanup();
        }
        return;
      }

      ev.preventDefault();

      // Move the floating clone to follow the cursor anywhere on screen
      setDragGhost((g) => g ? { ...g, x: cx - ds.offsetX, y: cy - ds.offsetY } : g);

      // Reorder only when hovering another card in the SAME column
      const under = document.elementsFromPoint(cx, cy)
        .find((el) => el.hasAttribute?.("data-card-id"));
      if (under) {
        const overId = under.getAttribute("data-card-id");
        const over = projects.find((x) => x.id === overId);
        if (over && over.status === ds.status && overId !== ds.id) {
          setDragOverId(overId);
          reorderWithinStatus(ds.status, ds.id, overId);
        }
      }
    };

    const onUp = () => {
      const ds = dragState.current;
      if (ds) {
        clearTimeout(ds.timer);
        if (ds.started) { commitOrder(); justDragged.current = true; }
      }
      dragState.current = null;
      setDraggingId(null);
      setDragOverId(null);
      setDragGhost(null);
      document.body.classList.remove("tr-dragging-active");
      cleanup();
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
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

  function persistPeople(next) {
    setPeople(next);
    (async () => {
      try { await savePeople(next); setStorageError(""); }
      catch (e) { setStorageError(e.message || "Couldn't save people"); }
    })();
  }

  function addPerson(rawName) {
    const name = rawName.trim();
    if (!name) return { ok: false, error: "Enter a name." };
    if (people.some((p) => p.toLowerCase() === name.toLowerCase()))
      return { ok: false, error: "That name is already on the list." };
    if (name.toLowerCase() === "both")
      return { ok: false, error: `"Both" is reserved.` };
    persistPeople([...people, name]);
    return { ok: true };
  }

  function renamePerson(oldName, rawNew) {
    const newName = rawNew.trim();
    if (!newName) return { ok: false, error: "Enter a name." };
    if (newName === oldName) return { ok: true };
    if (people.some((p) => p.toLowerCase() === newName.toLowerCase()))
      return { ok: false, error: "That name is already on the list." };
    if (newName.toLowerCase() === "both")
      return { ok: false, error: `"Both" is reserved.` };

    // Update the people list…
    persistPeople(people.map((p) => (p === oldName ? newName : p)));
    // …and cascade the rename to every project this person owns.
    persist(projects.map((p) => (p.owner === oldName ? { ...p, owner: newName } : p)));
    if (activePerson === oldName) setActivePerson(newName);
    if (weekFilter === oldName) setWeekFilter(newName);
    return { ok: true };
  }

  function removePerson(name) {
    if (people.length <= 1) return { ok: false, error: "Keep at least one person." };
    const ownedCount = projects.filter((p) => p.owner === name).length;
    persistPeople(people.filter((p) => p !== name));
    // Reassign this person's solo projects to "Both" so nothing is orphaned.
    if (ownedCount > 0) {
      persist(projects.map((p) => (p.owner === name ? { ...p, owner: "Both" } : p)));
    }
    if (activePerson === name) setActivePerson(people.find((p) => p !== name) || null);
    if (weekFilter === name) setWeekFilter("Both");
    return { ok: true, reassigned: ownedCount };
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
    setDraft({ ...emptyDraft(), due: defaultDueTime(), owner: currentPerson });
    setEditingId(null);
    setFormFocus(null);
    setShowForm(true);
  }

  function openEdit(p, focusField = null) {
    setDraft({ ...p, due: p.due ? p.due.slice(0, 16) : "" });
    setEditingId(p.id);
    setFormFocus(focusField);
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

  // Inline due-date edit straight from a card (no modal). Keeps the existing
  // time-of-day if there was one, otherwise defaults to 4pm.
  function setDue(p, dateStr) {
    if (!dateStr) return;
    const time = p.due && p.due.length >= 16 ? p.due.slice(11, 16) : "16:00";
    const dueISO = new Date(`${dateStr}T${time}`).toISOString();
    persist(projects.map((x) => (x.id === p.id ? { ...x, due: dueISO, updatedAt: new Date().toISOString() } : x)));
  }

  function setKind(p, kind) {
    persist(projects.map((x) => (x.id === p.id ? { ...x, kind, updatedAt: new Date().toISOString() } : x)));
  }

  if (loading || projects === null) {
    return (
      <div className="tr-root tr-center">
        <Loader2 className="tr-spin" size={22} />
      </div>
    );
  }

  const OWNERS = [...people, "Both"];
  // If the active person was renamed/removed, fall back to the first person
  const currentPerson = people.includes(activePerson) ? activePerson : (people[0] || null);
  const visibleProjects = projects.filter((p) => p.owner === currentPerson || p.owner === "Both");

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
      if (boardSort === "custom") {
        return (a.order ?? 1e9) - (b.order ?? 1e9);
      }
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

  // ── This Week digest: everything due in the next 7 days, both people ──
  const weekCutoff = Date.now() + 7 * 86400000;
  const weekItems = projects
    .filter((p) => p.status !== "Done" && p.due && new Date(p.due).getTime() <= weekCutoff)
    .filter((p) => weekFilter === "Both" || p.owner === weekFilter || p.owner === "Both")
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
          <h1 className="tr-title-clickable" onClick={() => setShowHelp(true)} title="How to use Hydro Tracker">
            Hydro Tracker
            <span className="tr-title-help">?</span>
          </h1>
        </div>
        <div className="tr-header-right">
          <button className="tr-export-btn" onClick={() => setShowSettings(true)} title="Manage people and settings">
            ⚙ Settings
          </button>
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
          {view !== "week" && people.length > 0 && (
            <SegControl
              options={people}
              value={currentPerson}
              onChange={setActivePerson}
              ariaLabel="Whose projects to view"
            />
          )}
          {view === "week" && (
            <SegControl
              options={[...people, "Both"]}
              value={weekFilter}
              onChange={setWeekFilter}
              ariaLabel="Filter this week by owner"
            />
          )}
        </div>
        {view === "board" && (
          <div className="tr-toolbar-right">
            <div className="tr-search">
              <Search size={14} />
              <input
                ref={boardSearchRef}
                placeholder={`Search ${currentPerson}'s projects…`}
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
                <option value="custom">Custom</option>
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
                  const collapsed = collapsedIds.has(p.id);
                  return (
                    <div
                      className={"tr-card"
                        + (isBlindSpot ? " tr-card-flagged" : "")
                        + (focusedCardId === p.id ? " tr-card-focused" : "")
                        + (collapsed ? " tr-card-collapsed" : "")
                        + (draggingId === p.id ? " tr-card-dragging" : "")
                        + (dragOverId === p.id && draggingId !== p.id ? " tr-card-dragover" : "")}
                      key={p.id}
                      data-card-id={p.id}
                      onPointerDown={(e) => cardPointerDown(e, p)}
                      onClick={() => {
                        if (justDragged.current) { justDragged.current = false; return; }
                        if (!draggingId) handleCardClick(p);
                      }}
                      onDoubleClick={() => handleCardDouble(p)}
                      title={collapsed ? "Click to expand · double-click to edit · hold to reorder" : "Click to collapse · double-click to edit · hold to reorder"}
                    >
                      {/* Type label — its own small caps line when expanded */}
                      {!collapsed && (
                        <div className="tr-kind-row" onClick={(e) => e.stopPropagation()}>
                          <select
                            className={"tr-kind-select" + (p.kind ? "" : " tr-kind-select-empty")}
                            value={p.kind || ""}
                            onChange={(e) => setKind(p, e.target.value)}
                            title="Set project type"
                          >
                            <option value="">— type —</option>
                            {PROJECT_KINDS.map((k) => (
                              <option key={k} value={k}>{k.toUpperCase()}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Title line — single row; carries type + due inline when collapsed */}
                      <div className="tr-card-oneline">
                        {isBlindSpot && (
                          <span
                            className="tr-flag-dot"
                            title={p.flagged ? p.flagReason : d && d.overdue ? "Overdue" : "Due soon"}
                          >
                            <AlertTriangle size={12} />
                          </span>
                        )}
                        {collapsed && p.kind && (
                          <span className="tr-kind-inline">{p.kind.toUpperCase()}</span>
                        )}
                        <span className="tr-oneline-titlewrap">
                          <span
                            className={"tr-oneline-title" + (copiedField === `${p.id}:title` ? " tr-copied" : "")}
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(p.title, `${p.id}:title`); }}
                            title="Click to copy title"
                          >
                            {p.title}
                          </span>
                          {copiedField === `${p.id}:title`
                            ? <span className="tr-copy-flash"><Check size={11} /> Copied</span>
                            : <span className="tr-copy-hint tr-copy-hint-expanded"><Copy size={11} /></span>}
                        </span>
                        {collapsed && d && (
                          <span className={"tr-due tr-due-mini" + (d.overdue ? " tr-due-over" : d.urgent ? " tr-due-urgent" : "")}>
                            <Clock size={11} />
                            <span className="tr-due-day">{d.dayWord}</span>
                            <span className="tr-due-time">{d.timeStr}</span>
                          </span>
                        )}
                      </div>

                      {/* Expandable body — animates open/closed */}
                      <div className={"tr-card-collapse" + (collapsed ? " tr-card-collapse-closed" : "")} aria-hidden={collapsed}>
                        <div className="tr-card-collapse-inner">
                          {p.projectCode && (
                            <button
                              className={"tr-code-badge" + (copiedField === `${p.id}:code` ? " tr-code-badge-copied" : "")}
                              onClick={(e) => { e.stopPropagation(); copyCode(p.projectCode, p.id); }}
                              title="Click to copy project number"
                              tabIndex={collapsed ? -1 : 0}
                            >
                              {copiedField === `${p.id}:code`
                                ? <><Check size={11} /> Copied</>
                                : p.projectCode}
                            </button>
                          )}
                          <div className="tr-card-meta">
                            <span className="tr-owner">
                              {p.owner === "Both" ? <Users size={12} /> : <User size={12} />}
                              {p.owner}
                            </span>
                            {d ? (
                              <span className="tr-due-wrap" onClick={(e) => e.stopPropagation()}>
                                <button
                                  className={"tr-due tr-due-btn" + (d.overdue ? " tr-due-over" : d.urgent ? " tr-due-urgent" : "")}
                                  onClick={(e) => {
                                    const input = e.currentTarget.parentElement.querySelector("input");
                                    input.focus();
                                    try { input.showPicker?.(); } catch { input.click(); }
                                  }}
                                  title="Click to change due date"
                                  tabIndex={collapsed ? -1 : 0}
                                >
                                  <Clock size={12} />
                                  <span className="tr-due-day">{d.dayWord}</span>
                                  <span className="tr-due-time">{d.timeStr}</span>
                                  {d.note && <span className="tr-due-note">{d.note}</span>}
                                </button>
                                <input
                                  type="date"
                                  className="tr-due-hidden"
                                  value={p.due ? p.due.slice(0, 10) : ""}
                                  onChange={(e) => { setDue(p, e.target.value); e.target.blur(); }}
                                  tabIndex={-1}
                                  aria-label="Change due date"
                                />
                              </span>
                            ) : (
                              <span className="tr-due-wrap" onClick={(e) => e.stopPropagation()}>
                                <button
                                  className="tr-due tr-due-btn tr-due-empty"
                                  onClick={(e) => {
                                    const input = e.currentTarget.parentElement.querySelector("input");
                                    input.focus();
                                    try { input.showPicker?.(); } catch { input.click(); }
                                  }}
                                  title="Set a due date"
                                  tabIndex={collapsed ? -1 : 0}
                                >
                                  <Clock size={12} /> Set due date
                                </button>
                                <input
                                  type="date"
                                  className="tr-due-hidden"
                                  value=""
                                  onChange={(e) => { setDue(p, e.target.value); e.target.blur(); }}
                                  tabIndex={-1}
                                  aria-label="Set due date"
                                />
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
                            <div className="tr-card-actions" onClick={(e) => e.stopPropagation()}>
                              <select
                                value={p.status}
                                onChange={(e) => setStatus(p, e.target.value)}
                                className="tr-status-select"
                                tabIndex={collapsed ? -1 : 0}
                              >
                                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                              <button
                                className={"tr-icon-btn tr-flag-btn" + (p.flagged ? " tr-flag-btn-on" : "")}
                                onClick={() => toggleFlag(p)}
                                title={p.flagged ? "Unflag" : "Mark as blind spot"}
                                tabIndex={collapsed ? -1 : 0}
                              >
                                {p.flagged ? <Check size={13} /> : <AlertTriangle size={13} />}
                              </button>
                              <button className="tr-icon-btn tr-del-btn" onClick={() => requestDelete(p)} title="Delete" tabIndex={collapsed ? -1 : 0}>
                                <X size={13} />
                              </button>
                            </div>
                          </div>
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
          <div className="tr-week-intro">
            Due in the next 7 days &mdash; {weekFilter === "Both" ? "everyone combined" : `${weekFilter}'s projects`}
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
                      <div className="tr-weekrow-title" onClick={() => { setView("board"); openEdit(p); }}>
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
                            className={"tr-code-badge" + (copiedField === `${p.id}:code` ? " tr-code-badge-copied" : "")}
                            onClick={() => copyCode(p.projectCode, p.id)}
                            title="Click to copy project number"
                          >
                            {copiedField === `${p.id}:code` ? "✓ copied!" : p.projectCode}
                          </button>
                        )}
                      </div>
                    </div>
                    {d && (
                      <span className={"tr-weekrow-due" + (d.overdue ? " tr-weekrow-due-over" : d.urgent ? " tr-weekrow-due-urgent" : "")}>
                        {d.timeStr}
                        {d.note && <span className="tr-weekrow-due-note">{d.note}</span>}
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
                          className={"tr-code-badge" + (copiedField === `${p.id}:code` ? " tr-code-badge-copied" : "")}
                          onClick={() => copyCode(p.projectCode, p.id)}
                          title="Click to copy project number"
                        >
                          {copiedField === `${p.id}:code` ? "✓ copied!" : p.projectCode}
                        </button>
                      )}
                    </div>
                  </div>
                  <button className="tr-icon-btn tr-del-btn" onClick={() => requestDelete(p)} title="Delete">
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
                <span>Type</span>
                <select value={draft.kind || ""} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                  <option value="">None</option>
                  {PROJECT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
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
            </div>
            <label className="tr-field">
              <span>Due date</span>
              <div className="tr-due-inputs">
                <input
                  ref={dueInputRef}
                  type="date"
                  className="tr-date-input"
                  value={draft.due ? draft.due.slice(0, 10) : ""}
                  onChange={(e) => {
                    const date = e.target.value;
                    const time = draft.due && draft.due.length >= 16 ? draft.due.slice(11, 16) : "16:00";
                    setDraft({ ...draft, due: date ? `${date}T${time}` : "" });
                    e.target.blur(); // collapse the calendar on pick
                  }}
                />
                <input
                  type="time"
                  className="tr-time-input"
                  value={draft.due && draft.due.length >= 16 ? draft.due.slice(11, 16) : ""}
                  onChange={(e) => {
                    const time = e.target.value;
                    const date = draft.due ? draft.due.slice(0, 10) : new Date().toISOString().slice(0, 10);
                    setDraft({ ...draft, due: time ? `${date}T${time}` : draft.due });
                  }}
                  disabled={!draft.due}
                />
              </div>
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

      {showSettings && (
        <SettingsModal
          people={people}
          projects={projects}
          onAdd={addPerson}
          onRename={renamePerson}
          onRemove={removePerson}
          onClose={() => setShowSettings(false)}
          backdropProps={backdropProps}
        />
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

      {showHelp && (
        <div className="tr-modal-backdrop" {...backdropProps(() => setShowHelp(false))}>
          <div className="tr-modal tr-modal-help" onClick={(e) => e.stopPropagation()}>
            <div className="tr-modal-head">
              <h2>How to use Hydro Tracker</h2>
              <button className="tr-close" onClick={() => setShowHelp(false)}><X size={18} /></button>
            </div>

            <p className="tr-help-lede">
              A shared board for tracking rep projects across the team. Everything syncs live for anyone with the link.
            </p>

            <div className="tr-help-section">
              <h3>The three views</h3>
              <ul className="tr-help-list">
                <li><strong>Board</strong> — your projects by stage: Not started, In progress, Waiting on reply.</li>
                <li><strong>Done</strong> — everything you've completed, searchable.</li>
                <li><strong>This week</strong> — anything due in the next 7 days, filterable by person or everyone.</li>
              </ul>
            </div>

            <div className="tr-help-section">
              <h3>Working with cards</h3>
              <ul className="tr-help-list">
                <li><strong>Single click</strong> a card to collapse or expand it — collapsed cards show just the title, flag, and due date.</li>
                <li><strong>Double click</strong> a card to edit it.</li>
                <li><strong>Click the title text</strong> to copy it to your clipboard.</li>
                <li><strong>Click the project number</strong> to copy it (paste it into Dynamics 365 search).</li>
                <li><strong>Click the due date</strong> to pick a new one right on the card.</li>
                <li>Use the <strong>status dropdown</strong> to move a project between stages, or the flag and delete icons for the rest.</li>
              </ul>
            </div>

            <div className="tr-help-section">
              <h3>The person toggle</h3>
              <p>Switches whose projects you're looking at on the Board and Done views. Projects owned by "Both" always show for everyone. Add or rename people in Settings.</p>
            </div>

            <div className="tr-help-section">
              <h3>Keyboard shortcuts</h3>
              <div className="tr-help-keys">
                <div><kbd>N</kbd><span>New project</span></div>
                <div><kbd>E</kbd><span>Edit focused card</span></div>
                <div><kbd>M</kbd><span>Move to next stage</span></div>
                <div><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd><span>Move focus between cards</span></div>
                <div><kbd>Ctrl</kbd><kbd>F</kbd><span>Search</span></div>
                <div><kbd>Esc</kbd><span>Clear search / focus</span></div>
              </div>
            </div>

            <div className="tr-help-section">
              <h3>Backups</h3>
              <p>Use <strong>Export</strong> to download a JSON snapshot, and <strong>Import</strong> to restore one. Handy before any big change.</p>
            </div>

            <div className="tr-modal-actions">
              <button className="tr-btn-primary" onClick={() => setShowHelp(false)}>Got it</button>
            </div>
          </div>
        </div>
      )}

      {dragGhost && (
        <div
          className={"tr-card tr-drag-ghost" + (dragGhost.flagged ? " tr-card-flagged" : "") + (dragGhost.collapsed ? " tr-card-collapsed" : "")}
          style={{
            left: dragGhost.x,
            top: dragGhost.y,
            width: dragGhost.w,
          }}
          dangerouslySetInnerHTML={{ __html: dragGhost.html }}
        />
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
.tr-title-clickable {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  cursor: pointer;
  transition: color 0.15s;
}
.tr-title-clickable:hover { color: var(--copper); }
.tr-title-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 19px;
  height: 19px;
  border-radius: 50%;
  border: 1.5px solid var(--line);
  color: var(--muted);
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 12px;
  font-weight: 600;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.tr-title-clickable:hover .tr-title-help {
  border-color: var(--copper);
  color: var(--copper);
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
/* Dynamic segmented control (person view + week filter) */
.tr-seg {
  position: relative;
  display: inline-flex;
  align-items: stretch;
  background: var(--paper-card);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px;
  height: 36px;
}
.tr-seg-pill {
  position: absolute;
  top: 3px;
  left: 3px;
  bottom: 3px;
  background: var(--ink);
  border-radius: 999px;
  transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1), width 0.22s ease;
}
.tr-seg-btn {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  min-width: 54px;
  max-width: 150px;
  padding: 0 16px;
  border: none;
  background: none;
  cursor: pointer;
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.15s;
}
.tr-seg-btn-active { color: var(--paper); }
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
  padding: 12px 14px;
  position: relative;
  cursor: pointer;
  transition: box-shadow 0.35s ease, border-color 0.35s ease, transform 0.12s ease, opacity 0.15s ease;
  touch-action: pan-y;
}
.tr-card:hover { box-shadow: 0 2px 8px rgba(22,35,61,0.07); }

/* Slide-open / slide-closed animation via grid rows */
.tr-card-collapse {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.22s ease, margin-top 0.28s ease;
  opacity: 1;
  margin-top: 9px;
}
.tr-card-collapse-closed {
  grid-template-rows: 0fr;
  opacity: 0;
  margin-top: 0;
}
.tr-card-collapse-inner {
  overflow: hidden;
  min-height: 0;
}

/* Drag-to-reorder states */
/* The original card left behind becomes a quiet placeholder gap */
.tr-card-dragging {
  opacity: 0.35;
  background: var(--paper);
  border-style: dashed;
  box-shadow: none;
}
.tr-card-dragging * { visibility: hidden; }
.tr-card-dragover {
  box-shadow: 0 0 0 2px var(--copper);
}

/* The floating clone that follows the cursor */
.tr-drag-ghost {
  position: fixed;
  z-index: 1000;
  pointer-events: none;
  margin: 0;
  cursor: grabbing;
  box-shadow: 0 12px 32px rgba(22,35,61,0.22);
  transform: rotate(-1.2deg) scale(1.03);
  transition: none;
  opacity: 0.97;
}

/* While a card is being dragged, kill text selection everywhere */
body.tr-dragging-active {
  cursor: grabbing !important;
  user-select: none !important;
  -webkit-user-select: none !important;
}
body.tr-dragging-active * {
  cursor: grabbing !important;
  user-select: none !important;
  -webkit-user-select: none !important;
}

.tr-kind-row {
  margin-bottom: 5px;
  line-height: 1;
}
.tr-kind-select {
  appearance: none;
  -webkit-appearance: none;
  border: none;
  background: none;
  padding: 0;
  margin: 0;
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: uppercase;
  color: var(--muted);
  cursor: pointer;
  transition: color 0.15s;
}
.tr-kind-select:hover { color: var(--copper); }
.tr-kind-select:focus { outline: none; color: var(--copper); }
.tr-kind-select-empty { color: #BCC5D2; font-weight: 600; }
.tr-kind-inline {
  flex-shrink: 0;
  font-size: 13.5px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--muted);
}
.tr-card-oneline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.tr-flag-dot {
  display: inline-flex;
  align-items: center;
  color: var(--alert);
  flex-shrink: 0;
}
.tr-oneline-titlewrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.tr-oneline-title {
  min-width: 0;
  max-width: 100%;
  font-weight: 600;
  font-size: 13.5px;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: color 0.15s;
}
.tr-oneline-title:hover { color: var(--copper); }
.tr-oneline-title.tr-copied { color: var(--ok); }
.tr-copy-hint-expanded { opacity: 0; }
.tr-card-oneline:hover .tr-copy-hint-expanded { opacity: 0.55; }
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
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  font-weight: 600;
  font-size: 13.5px;
  line-height: 1.4;
  color: var(--ink);
}
.tr-card-title-text {
  min-width: 0;
  cursor: pointer;
  transition: color 0.15s;
}
.tr-card-title-text:hover { color: var(--copper); }
.tr-card-title-text.tr-copied { color: var(--ok); }
/* Shared copy feedback: hint on hover, green flash on success */
.tr-copy-hint {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  color: var(--muted);
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
  margin-top: 2px;
}
.tr-card-title:hover .tr-copy-hint { opacity: 0.55; }
.tr-copy-flash {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--ok);
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-top: 2px;
  animation: tr-copy-pop 0.18s ease-out;
}
@keyframes tr-copy-pop {
  from { transform: scale(0.82); opacity: 0.4; }
  to { transform: scale(1); opacity: 1; }
}
.tr-due-mini {
  flex-shrink: 0;
  gap: 4px;
  padding: 3px 7px 3px 6px;
  font-size: 11px;
}
.tr-due-mini .tr-due-time { font-size: 10px; }
.tr-code-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.08em;
  background: #EEF3FA;
  color: #3A5A8C;
  border: 1px solid #C8D8EE;
  border-radius: 5px;
  padding: 3px 8px;
  cursor: pointer;
  margin: 8px 0 0;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  white-space: nowrap;
}
.tr-code-badge:hover { background: #DEE9F6; color: var(--ink); border-color: #A9C3E4; }
.tr-code-badge-copied {
  background: var(--ok) !important;
  color: #fff !important;
  border-color: var(--ok) !important;
  animation: tr-copy-pop 0.18s ease-out;
}
.tr-card-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: var(--muted);
  margin-top: 9px;
}
.tr-owner { display: flex; align-items: center; gap: 5px; font-weight: 500; }
.tr-due {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-family: inherit;
  padding: 4px 8px 4px 7px;
  border-radius: 6px;
  background: var(--paper);
  border: 1px solid var(--line);
  color: var(--muted);
}
.tr-due-btn { cursor: pointer; transition: border-color 0.15s, background 0.15s; }
.tr-due-btn:hover { border-color: var(--ink); }
.tr-due-empty { color: var(--muted); font-style: normal; }
.tr-due-empty:hover { color: var(--ink); }
.tr-due-wrap { position: relative; display: inline-flex; }
.tr-due-hidden {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: 0;
  border: 0;
  opacity: 0;
  pointer-events: none;
}
.tr-due-day {
  font-weight: 600;
  color: var(--ink);
  letter-spacing: -0.01em;
}
.tr-due-time {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  opacity: 0.85;
}
.tr-due-note {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9.5px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  font-weight: 500;
  padding-left: 6px;
  border-left: 1px solid currentColor;
  opacity: 0.9;
}
.tr-due-urgent {
  background: #FBEFE5;
  border-color: #EBD3BE;
  color: var(--copper);
}
.tr-due-urgent .tr-due-day { color: var(--copper); }
.tr-due-urgent:hover { border-color: var(--copper); }
.tr-due-over {
  background: #FDF0ED;
  border-color: #EAC0B8;
  color: var(--alert);
}
.tr-due-over .tr-due-day { color: var(--alert); }
.tr-due-over:hover { border-color: var(--alert); }
.tr-card-notes {
  font-size: 11.5px;
  color: var(--muted);
  margin-top: 9px;
  line-height: 1.5;
}
.tr-card-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 11px;
  padding-top: 10px;
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
  gap: 6px;
  margin-left: auto;
}
.tr-status-select {
  appearance: none;
  -webkit-appearance: none;
  font-size: 12px;
  font-family: 'IBM Plex Sans', sans-serif;
  font-weight: 600;
  border: none;
  background: none;
  color: var(--muted);
  padding: 0;
  max-width: 130px;
  cursor: pointer;
  transition: color 0.15s;
}
.tr-status-select:hover { color: var(--copper); }
.tr-status-select:focus { outline: none; color: var(--copper); }
.tr-icon-btn {
  border: 1px solid transparent;
  background: none;
  border-radius: 6px;
  width: 26px;
  height: 26px;
  cursor: pointer;
  color: #A2ADBE;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
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
.tr-modal-help { max-width: 520px; }
.tr-modal-settings { max-width: 460px; }
.tr-set-section { margin-bottom: 6px; }
.tr-set-section h3 {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--copper);
  margin: 0 0 6px;
}
.tr-set-hint {
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.5;
  margin: 0 0 14px;
}
.tr-set-people {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.tr-set-person {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px 10px 8px 12px;
  min-height: 44px;
  flex-wrap: wrap;
}
.tr-set-name {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ink);
}
.tr-set-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--ink);
  color: var(--paper);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.tr-set-count {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  font-weight: 400;
  color: var(--muted);
  letter-spacing: 0.02em;
}
.tr-set-actions { display: flex; align-items: center; gap: 3px; }
.tr-set-editrow {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  flex-wrap: wrap;
}
.tr-set-input {
  flex: 1;
  min-width: 120px;
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 13.5px;
  color: var(--ink);
  background: var(--paper-card);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px 10px;
  transition: border-color 0.15s;
}
.tr-set-input:focus { outline: none; border-color: var(--ink); }
.tr-set-save, .tr-set-cancel { height: 34px; padding: 0 12px; }
.tr-set-removebox {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tr-set-confirm-text {
  font-size: 12.5px;
  color: var(--alert);
  font-weight: 600;
  line-height: 1.4;
}
.tr-set-confirm-instruct {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
}
.tr-set-confirm-instruct code {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  background: var(--paper-card);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 1px 6px;
  color: var(--alert);
}
.tr-btn-danger-solid:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.tr-set-addrow {
  display: flex;
  gap: 8px;
}
.tr-set-addrow .tr-set-input { flex: 1; }
.tr-set-error {
  font-size: 12px;
  color: var(--alert);
  margin-top: 7px;
  width: 100%;
}
.tr-icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.tr-help-lede {
  font-size: 13.5px;
  color: var(--ink);
  line-height: 1.55;
  margin: 0 0 20px;
}
.tr-help-section { margin-bottom: 18px; }
.tr-help-section:last-of-type { margin-bottom: 8px; }
.tr-help-section h3 {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--copper);
  margin: 0 0 8px;
}
.tr-help-section p {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.55;
  margin: 0;
}
.tr-help-section p strong,
.tr-help-list strong { color: var(--ink); font-weight: 600; }
.tr-help-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.tr-help-list li {
  position: relative;
  padding-left: 16px;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
}
.tr-help-list li::before {
  content: "";
  position: absolute;
  left: 3px;
  top: 8px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--copper-dim);
}
.tr-help-keys {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px 18px;
}
.tr-help-keys > div {
  display: flex;
  align-items: center;
  gap: 6px;
}
.tr-help-keys span {
  font-size: 12.5px;
  color: var(--muted);
}
.tr-help-keys kbd {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-bottom-width: 2px;
  border-radius: 4px;
  padding: 2px 6px;
  color: var(--ink);
  min-width: 20px;
  text-align: center;
}
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

/* ── Card focus ring (keyboard nav, fades after 5s) ── */
.tr-card-focused {
  border-color: var(--ink);
  box-shadow: 0 0 0 2px rgba(22,35,61,0.18), 0 2px 10px rgba(22,35,61,0.08);
}

/* ── Due date inputs in the form ─────────────────── */
.tr-due-inputs { display: flex; gap: 10px; }
.tr-date-input { flex: 1 1 0; min-width: 0; }
.tr-time-input { flex: 0 0 130px; min-width: 0; }
.tr-time-input:disabled { opacity: 0.5; cursor: not-allowed; }
.tr-field input[type="date"], .tr-field input[type="time"] {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 13px;
  letter-spacing: 0.01em;
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  flex-shrink: 0;
}
.tr-weekrow-due-urgent { color: var(--copper); font-weight: 500; }
.tr-weekrow-due-over { color: var(--alert); font-weight: 500; }
.tr-weekrow-due-note {
  font-size: 9.5px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding-left: 6px;
  border-left: 1px solid currentColor;
  opacity: 0.9;
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

