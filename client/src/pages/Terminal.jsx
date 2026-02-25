import { useEffect, useState, useRef } from 'react';
import { Plus, X, Pencil, Check, Columns2 } from 'lucide-react';
import { useTerminal } from '../contexts/TerminalContext';
import TerminalPane from '../components/TerminalPane';

export default function Terminal() {
  const {
    sessions,
    activeTabId,
    setActiveTab,
    createSession,
    closeSession,
    renameSession,
    splitTab,
    unsplitTab,
  } = useTerminal();

  // Derive per-tab split state from the active session
  const activeSession = sessions.find((s) => s.id === activeTabId);
  const currentSplitId = activeSession?.splitId ?? null;

  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const editRef = useRef(null);

  // Auto-create a session on first visit (or when last tab is closed)
  useEffect(() => {
    if (sessions.length === 0) createSession();
  }, [sessions.length, createSession]);

  // Focus rename input
  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingId]);

  // ── Tab rename helpers ──────────────────────────────────────────
  function startRename(id, name) {
    setEditingId(id);
    setEditValue(name);
  }

  function commitRename() {
    if (editingId && editValue.trim()) renameSession(editingId, editValue.trim());
    setEditingId(null);
  }

  function cancelRename() {
    setEditingId(null);
  }

  // ── Split / close ──────────────────────────────────────────────
  function handleSplit() {
    if (!activeTabId) return;
    if (currentSplitId) {
      unsplitTab(activeTabId);   // promotes right pane to its own tab
    } else {
      splitTab(activeTabId);     // creates a child session inside this tab
    }
  }

  function handleClose(id) {
    closeSession(id);
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Tab Bar ──────────────────────────────────────────────── */}
      <div className="flex items-center border-b-2 border-gb-bg2 pb-1 mb-1 gap-1">
        {/* Tabs */}
        <div className="flex items-center gap-1 flex-1 overflow-x-auto min-w-0">
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => setActiveTab(s.id)}
              className={`group flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold border-2 cursor-pointer transition-colors select-none shrink-0 ${
                s.id === activeTabId
                  ? 'bg-gb-bg1 text-gb-aqua border-gb-aqua-dim'
                  : 'bg-gb-bg0 text-gb-fg4 border-gb-bg3 hover:text-gb-fg1 hover:bg-gb-bg1'
              }`}
            >
              {/* Alive dot */}
              <span
                className={`inline-block w-1.5 h-1.5 shrink-0 ${
                  s.alive ? 'bg-gb-green' : 'bg-gb-bg4'
                }`}
              />

              {editingId === s.id ? (
                /* ── Rename input ─────────────────────────────── */
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    commitRename();
                  }}
                  className="flex items-center gap-1"
                >
                  <input
                    ref={editRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => e.key === 'Escape' && cancelRename()}
                    className="w-24 bg-gb-bg0-hard text-gb-fg1 text-sm px-1 py-0 border border-gb-aqua-dim focus:outline-none"
                  />
                  <button type="submit" className="text-gb-green hover:text-gb-green-dim">
                    <Check size={12} />
                  </button>
                </form>
              ) : (
                /* ── Normal tab content ───────────────────────── */
                <>
                  <span className="truncate max-w-32">{s.name}</span>

                  {/* Rename button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(s.id, s.name);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-gb-fg4 hover:text-gb-yellow transition-opacity"
                    title="Rename tab"
                  >
                    <Pencil size={12} />
                  </button>

                  {/* Close button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClose(s.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-gb-fg4 hover:text-gb-red transition-opacity"
                    title="Close tab"
                  >
                    <X size={12} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 ml-2 shrink-0">
          {/* New tab */}
          <button
            onClick={() => createSession()}
            className="flex items-center justify-center w-8 h-8 border-2 border-gb-bg3 bg-gb-bg0 text-gb-fg4 hover:text-gb-green hover:border-gb-green-dim transition-colors"
            title="New tab"
          >
            <Plus size={14} />
          </button>

          {/* Split toggle */}
          <button
            onClick={handleSplit}
            className={`flex items-center justify-center w-8 h-8 border-2 transition-colors ${
              currentSplitId
                ? 'bg-gb-bg1 text-gb-aqua border-gb-aqua-dim'
                : 'bg-gb-bg0 text-gb-fg4 border-gb-bg3 hover:text-gb-aqua hover:border-gb-aqua-dim'
            }`}
            title={currentSplitId ? 'Unsplit (promote to tab)' : 'Split terminal'}
          >
            <Columns2 size={14} />
          </button>
        </div>
      </div>

      {/* ── Terminal Pane(s) ──────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex gap-1">
        {/* Main pane */}
        {activeTabId && (
          <div
            className={`border-2 border-gb-bg2 overflow-hidden ${
              currentSplitId ? 'flex-1' : 'w-full'
            }`}
          >
            <TerminalPane key={activeTabId} sessionId={activeTabId} />
          </div>
        )}

        {/* Split pane (per-tab) */}
        {currentSplitId && (
          <div className="flex-1 border-2 border-gb-bg2 overflow-hidden">
            <TerminalPane key={currentSplitId} sessionId={currentSplitId} />
          </div>
        )}
      </div>
    </div>
  );
}
