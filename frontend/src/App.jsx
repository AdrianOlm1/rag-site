import { useState, useRef, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ─── Icons ─────────────────────────────────────────────────────────────────────

const UploadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14H6L5 6"/>
    <path d="M10 11v6M14 11v6"/>
  </svg>
);

const FileIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="22" y1="2" x2="11" y2="13"/>
    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);

const SpinnerIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{animation: "spin 1s linear infinite"}}>
    <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
    <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1"/>
  </svg>
);

const SunIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

// ─── App ───────────────────────────────────────────────────────────────────────

const THEME_KEY = "docqa-theme";
const ACCESS_STORAGE_KEY = "docqa-access-code";

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [tab, setTab] = useState("chat"); // "chat" | "library"
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch (_) {}
    return "dark";
  });
  const [accessCode, setAccessCode] = useState(() => {
    try {
      return sessionStorage.getItem(ACCESS_STORAGE_KEY) || "";
    } catch (_) {
      return "";
    }
  });
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return !!sessionStorage.getItem(ACCESS_STORAGE_KEY);
    } catch (_) {
      return false;
    }
  });
  const [gateInput, setGateInput] = useState("");
  const [gateError, setGateError] = useState("");
  const [gateLoading, setGateLoading] = useState(false);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (_) {}
  }, [theme]);

  function toggleTheme() {
    setTheme(prev => prev === "dark" ? "light" : "dark");
  }

  function lockOut() {
    try {
      sessionStorage.removeItem(ACCESS_STORAGE_KEY);
    } catch (_) {}
    setAccessCode("");
    setUnlocked(false);
  }

  function authHeaders() {
    if (!accessCode) return {};
    return {
      "X-Access-Code": accessCode,
      "Authorization": `Bearer ${accessCode}`,
    };
  }

  useEffect(() => {
    if (unlocked) fetchDocuments();
  }, [unlocked]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function fetchDocuments() {
    try {
      const res = await fetch(`${API}/api/documents`, { headers: authHeaders() });
      if (res.status === 401) {
        lockOut();
        return;
      }
      const data = await res.json();
      setDocuments(data);
    } catch (e) {
      console.error("Failed to fetch documents", e);
    }
  }

  async function uploadFile(file) {
    if (!file.name.endsWith(".pdf")) {
      alert("Only PDF files are supported.");
      return;
    }
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${API}/api/documents`, { method: "POST", body: form, headers: authHeaders() });
      if (res.status === 401) {
        lockOut();
        return;
      }
      if (!res.ok) {
        const err = await res.json();
        alert(err.detail || "Upload failed.");
      } else {
        await fetchDocuments();
        setTab("chat");
      }
    } catch (e) {
      alert("Upload failed. Is the backend running?");
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument(id) {
    try {
      const res = await fetch(`${API}/api/documents/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.status === 401) {
        lockOut();
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || "Failed to delete document.");
        return;
      }
      setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
      await fetchDocuments();
    } catch (e) {
      console.error("Delete document failed", e);
      alert("Failed to delete document. Is the backend running?");
    }
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  async function sendQuestion() {
    if (!question.trim() || chatLoading) return;

    const userMsg = { role: "user", content: question };
    setMessages(prev => [...prev, userMsg]);
    setQuestion("");
    setChatLoading(true);

    const assistantMsg = { role: "assistant", content: "" };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      // Only include selected document IDs so the backend restricts search to those docs
      const scopeIds = selectedIds.size > 0 ? Array.from(selectedIds) : null;

      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          question: userMsg.content,
          document_ids: scopeIds,
        }),
      });

      if (res.status === 401) {
        lockOut();
        return;
      }
      if (!res.ok) {
        const err = await res.json();
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: `Error: ${err.detail}` };
          return copy;
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const token = decoder.decode(value);
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: copy[copy.length - 1].content + token,
          };
          return copy;
        });
      }
    } catch (e) {
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: "Connection error. Is the backend running?" };
        return copy;
      });
    } finally {
      setChatLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuestion();
    }
  }

  async function submitAccessCode() {
    setGateError("");
    setGateLoading(true);
    try {
      const code = gateInput.trim();
      const headers = code
        ? { "X-Access-Code": code, "Authorization": `Bearer ${code}` }
        : {};
      const res = await fetch(`${API}/api/documents`, { headers });
      if (res.status === 401) {
        setGateError("Invalid code");
        setGateLoading(false);
        return;
      }
      try {
        if (code) sessionStorage.setItem(ACCESS_STORAGE_KEY, code);
      } catch (_) {}
      setAccessCode(code);
      setUnlocked(true);
    } catch (e) {
      setGateError("Could not reach server");
    } finally {
      setGateLoading(false);
    }
  }

  const scopeLabel = selectedIds.size === 0
    ? "All documents"
    : `${selectedIds.size} document${selectedIds.size > 1 ? "s" : ""} selected`;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* Dark mode — deep blue hue */
        [data-theme="dark"] {
          --bg: #0c1222;
          --bg-hue: linear-gradient(135deg, #0c1222 0%, #0f1a2e 50%, #0d1528 100%);
          --surface: #131d32;
          --surface2: #1a2742;
          --border: #243553;
          --accent: #7dd3fc;
          --accent-dim: rgba(125, 211, 252, 0.14);
          --send-btn-fg: #0c1222;
          --text: #e2e8f4;
          --text-dim: #94a3b8;
          --text-dimmer: #64748b;
          --danger: #f87171;
          --user-bubble: #1a2742;
          --ai-bubble: #151f36;
          --radius: 12px;
        }

        /* Light mode */
        [data-theme="light"] {
          --bg: #f0f4fc;
          --bg-hue: linear-gradient(135deg, #f0f4fc 0%, #e8eef8 50%, #e2eaf6 100%);
          --surface: #ffffff;
          --surface2: #f1f5f9;
          --border: #cbd5e1;
          --accent: #0ea5e9;
          --accent-dim: rgba(14, 165, 233, 0.12);
          --send-btn-fg: #ffffff;
          --text: #1e293b;
          --text-dim: #475569;
          --text-dimmer: #94a3b8;
          --danger: #dc2626;
          --user-bubble: #e2e8f0;
          --ai-bubble: #ffffff;
          --radius: 12px;
        }

        body {
          background: var(--bg);
          color: var(--text);
          font-family: 'DM Sans', sans-serif;
          font-weight: 300;
          height: 100vh;
          overflow: hidden;
          transition: background-color 0.35s ease, color 0.25s ease;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeInScale { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(8px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes themeIconIn { from { opacity: 0; transform: rotate(-90deg); } to { opacity: 1; transform: rotate(0); } }

        .layout {
          display: grid;
          grid-template-columns: 280px 1fr;
          height: 100vh;
          background: var(--bg-hue);
          transition: background 0.35s ease;
        }

        /* ── Sidebar ── */
        .sidebar {
          background: var(--surface);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transition: background 0.35s ease, border-color 0.35s ease;
        }

        .sidebar-header {
          padding: 28px 20px 20px;
          border-bottom: 1px solid var(--border);
        }

        .logo {
          font-family: 'DM Serif Display', serif;
          font-size: 22px;
          color: var(--text);
          letter-spacing: -0.5px;
          margin-bottom: 4px;
        }

        .logo span { color: var(--accent); }

        .tagline {
          font-size: 11px;
          color: var(--text-dimmer);
          letter-spacing: 0.5px;
          text-transform: uppercase;
          font-family: 'DM Mono', monospace;
        }

        .upload-area {
          margin: 16px;
          border: 1.5px dashed var(--border);
          border-radius: var(--radius);
          padding: 20px;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.25s ease, background 0.25s ease, transform 0.2s ease;
          background: transparent;
        }

        .upload-area:hover { transform: translateY(-1px); }
        .upload-area:hover, .upload-area.drag-over {
          border-color: var(--accent);
          background: var(--accent-dim);
        }

        .upload-area.uploading {
          pointer-events: none;
          opacity: 0.6;
        }

        .upload-icon {
          color: var(--accent);
          margin-bottom: 8px;
          display: flex;
          justify-content: center;
        }

        .upload-text {
          font-size: 12px;
          color: var(--text-dim);
          line-height: 1.5;
        }

        .upload-text strong {
          color: var(--text);
          font-weight: 500;
          display: block;
          margin-bottom: 2px;
        }

        .doc-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }

        .doc-list-header {
          padding: 8px 8px 4px;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: var(--text-dimmer);
          font-family: 'DM Mono', monospace;
        }

        .doc-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 10px;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
          border: 1px solid transparent;
          margin-bottom: 2px;
          animation: slideInRight 0.3s ease backwards;
        }

        .doc-item:hover { background: var(--surface2); transform: translateX(2px); }

        .doc-item.selected {
          background: var(--accent-dim);
          border-color: var(--accent);
        }

        .doc-checkbox {
          width: 14px;
          height: 14px;
          border: 1.5px solid var(--border);
          border-radius: 4px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }

        .doc-item.selected .doc-checkbox {
          background: var(--accent);
          border-color: var(--accent);
        }

        .doc-checkbox-check {
          width: 8px;
          height: 8px;
          color: #0c1222;
        }
        [data-theme="light"] .doc-checkbox-check { color: #0f172a; }

        .doc-info {
          flex: 1;
          min-width: 0;
        }

        .doc-name {
          font-size: 12px;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-weight: 400;
        }

        .doc-meta {
          font-size: 10px;
          color: var(--text-dimmer);
          font-family: 'DM Mono', monospace;
          margin-top: 1px;
        }

        .doc-delete {
          opacity: 0;
          background: none;
          border: none;
          color: var(--danger);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          transition: opacity 0.15s;
          flex-shrink: 0;
        }

        .doc-item:hover .doc-delete { opacity: 1; }

        .empty-docs {
          padding: 24px 16px;
          text-align: center;
          color: var(--text-dimmer);
          font-size: 12px;
          line-height: 1.6;
        }

        .scope-bar {
          margin: 8px 16px 16px;
          padding: 8px 12px;
          background: var(--surface2);
          border-radius: 8px;
          font-size: 11px;
          color: var(--text-dim);
          font-family: 'DM Mono', monospace;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .scope-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent);
          flex-shrink: 0;
        }

        /* ── Main ── */
        .main {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: transparent;
          transition: background 0.35s ease;
        }

        .main-header {
          padding: 20px 28px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          gap: 12px;
          transition: border-color 0.35s ease;
        }

        .theme-toggle {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--surface2);
          color: var(--text-dim);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
        }
        .theme-toggle:hover {
          color: var(--accent);
          border-color: var(--accent);
          background: var(--accent-dim);
          transform: scale(1.05);
        }
        .theme-toggle:active { transform: scale(0.98); }
        .theme-toggle svg { animation: themeIconIn 0.3s ease; }

        .main-title {
          font-family: 'DM Serif Display', serif;
          font-size: 18px;
          color: var(--text);
          flex: 1;
        }

        .clear-btn {
          background: none;
          border: 1px solid var(--border);
          color: var(--text-dim);
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          transition: border-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
        }

        .clear-btn:hover {
          border-color: var(--text-dim);
          color: var(--text);
          transform: translateY(-1px);
        }
        .clear-btn:active { transform: translateY(0); }

        /* ── Chat ── */
        .chat-area {
          flex: 1;
          overflow-y: auto;
          padding: 28px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .empty-state {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 12px;
          animation: fadeUp 0.4s ease;
        }

        .empty-state-icon {
          font-size: 48px;
          filter: grayscale(0.3);
        }

        .empty-state h2 {
          font-family: 'DM Serif Display', serif;
          font-size: 26px;
          color: var(--text);
          font-weight: 400;
        }

        .empty-state p {
          color: var(--text-dim);
          font-size: 14px;
          max-width: 340px;
          line-height: 1.6;
        }

        .message {
          display: flex;
          flex-direction: column;
          gap: 4px;
          animation: fadeInScale 0.35s ease;
          max-width: 780px;
        }

        .message.user { align-self: flex-end; }
        .message.assistant { align-self: flex-start; }

        .message-role {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: var(--text-dimmer);
          font-family: 'DM Mono', monospace;
          padding: 0 4px;
        }

        .message.user .message-role { text-align: right; }

        .message-bubble {
          padding: 14px 18px;
          border-radius: var(--radius);
          font-size: 14px;
          line-height: 1.7;
          white-space: pre-wrap;
          word-break: break-word;
          transition: box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .message-bubble:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.06); }

        .message.user .message-bubble {
          background: var(--surface2);
          border: 1px solid var(--border);
          border-bottom-right-radius: 4px;
        }

        .message.assistant .message-bubble {
          background: var(--ai-bubble);
          border: 1px solid var(--border);
          border-bottom-left-radius: 4px;
          color: var(--text);
        }

        .thinking {
          display: flex;
          gap: 4px;
          align-items: center;
          padding: 14px 18px;
        }

        .thinking-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent);
          animation: pulse 1.4s ease infinite;
        }

        .thinking-dot:nth-child(2) { animation-delay: 0.2s; }
        .thinking-dot:nth-child(3) { animation-delay: 0.4s; }

        /* ── Input ── */
        .input-area {
          padding: 16px 28px 24px;
          border-top: 1px solid var(--border);
        }

        .input-row {
          display: flex;
          gap: 10px;
          align-items: flex-end;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 10px 10px 10px 16px;
          transition: border-color 0.25s ease, box-shadow 0.25s ease;
        }

        .input-row:focus-within {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-dim);
        }

        .question-input {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          color: var(--text);
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 300;
          resize: none;
          max-height: 120px;
          line-height: 1.5;
        }

        .question-input::placeholder { color: var(--text-dimmer); }

        .send-btn {
          background: var(--accent);
          border: none;
          border-radius: 8px;
          color: var(--send-btn-fg);
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: opacity 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
        }

        .send-btn:hover { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 4px 12px var(--accent-dim); }
        .send-btn:active { transform: translateY(0) scale(0.96); }
        .send-btn:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }

        .input-hint {
          font-size: 11px;
          color: var(--text-dimmer);
          margin-top: 8px;
          text-align: center;
          font-family: 'DM Mono', monospace;
        }

        .access-gate {
          min-height: 100vh;
          background: var(--bg-hue);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .access-gate-box {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 32px;
          width: 100%;
          max-width: 360px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.15);
        }
        .access-gate-box .logo {
          font-family: 'DM Serif Display', serif;
          font-size: 24px;
          color: var(--text);
          margin-bottom: 8px;
        }
        .access-gate-box .logo span { color: var(--accent); }
        .access-gate-box .tagline {
          font-size: 11px;
          color: var(--text-dimmer);
          margin-bottom: 24px;
          font-family: 'DM Mono', monospace;
        }
        .access-gate-box input {
          width: 100%;
          padding: 12px 14px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--surface2);
          color: var(--text);
          font-size: 14px;
          font-family: 'DM Mono', monospace;
          letter-spacing: 2px;
          margin-bottom: 12px;
        }
        .access-gate-box input:focus {
          outline: none;
          border-color: var(--accent);
        }
        .access-gate-box input::placeholder {
          color: var(--text-dimmer);
        }
        .access-gate-box .gate-error {
          color: var(--danger);
          font-size: 12px;
          margin-bottom: 12px;
        }
        .access-gate-box button {
          width: 100%;
          padding: 12px;
          border: none;
          border-radius: 8px;
          background: var(--accent);
          color: var(--send-btn-fg);
          font-weight: 500;
          cursor: pointer;
          font-size: 14px;
        }
        .access-gate-box button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
      `}</style>

      {!unlocked ? (
        <div className="access-gate">
          <div className="access-gate-box">
            <div className="logo">doc<span>.</span>qa</div>
            <div className="tagline">Enter access code</div>
            <input
              type="password"
              placeholder="Access code"
              value={gateInput}
              onChange={e => { setGateInput(e.target.value); setGateError(""); }}
              onKeyDown={e => e.key === "Enter" && submitAccessCode()}
              autoFocus
              disabled={gateLoading}
            />
            {gateError && <div className="gate-error">{gateError}</div>}
            <button onClick={submitAccessCode} disabled={gateLoading}>
              {gateLoading ? "Checking…" : "Enter"}
            </button>
          </div>
        </div>
      ) : (
      <div className="layout">

        {/* ── Sidebar ── */}
        <div className="sidebar">
          <div className="sidebar-header">
            <div className="logo">doc<span>.</span>qa</div>
            <div className="tagline">RAG-powered document chat</div>
            <button
              type="button"
              onClick={lockOut}
              style={{
                marginTop: 12,
                padding: "6px 10px",
                fontSize: 11,
                color: "var(--text-dimmer)",
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Lock
            </button>
          </div>

          {/* Upload area */}
          <div
            className={`upload-area ${dragOver ? "drag-over" : ""} ${uploading ? "uploading" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) uploadFile(file);
            }}
          >
            <div className="upload-icon">
              {uploading ? <SpinnerIcon /> : <UploadIcon />}
            </div>
            <div className="upload-text">
              <strong>{uploading ? "Processing…" : "Upload PDF"}</strong>
              {uploading ? "Embedding chunks" : "drag & drop or click"}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              style={{ display: "none" }}
              onChange={e => { const f = e.target.files[0]; if (f) uploadFile(f); e.target.value = ""; }}
            />
          </div>

          {/* Document list */}
          <div className="doc-list">
            {documents.length > 0 && (
              <div className="doc-list-header">Documents — click to select scope</div>
            )}

            {documents.length === 0 ? (
              <div className="empty-docs">
                No documents yet.<br />Upload a PDF to get started.
              </div>
            ) : (
              documents.map((doc, idx) => (
                <div
                  key={doc.id}
                  className={`doc-item ${selectedIds.has(doc.id) ? "selected" : ""}`}
                  style={{ animationDelay: `${idx * 0.04}s` }}
                  onClick={() => toggleSelect(doc.id)}
                >
                  <div className="doc-checkbox">
                    {selectedIds.has(doc.id) && (
                      <svg className="doc-checkbox-check" viewBox="0 0 8 8" fill="currentColor">
                        <path d="M1 4l2 2 4-4" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                      </svg>
                    )}
                  </div>
                  <div className="doc-info">
                    <div className="doc-name" title={doc.filename}>{doc.filename}</div>
                    <div className="doc-meta">{doc.chunk_count} chunks</div>
                  </div>
                  <button
                    className="doc-delete"
                    onClick={e => { e.stopPropagation(); deleteDocument(doc.id); }}
                    title="Delete"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Scope indicator */}
          <div className="scope-bar">
            <div className="scope-dot" />
            {scopeLabel}
          </div>
        </div>

        {/* ── Main chat area ── */}
        <div className="main">
          <div className="main-header">
            <div className="main-title">Ask anything</div>
            <button className="theme-toggle" onClick={toggleTheme} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} aria-label="Toggle theme">
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
            {messages.length > 0 && (
              <button className="clear-btn" onClick={() => setMessages([])}>
                Clear chat
              </button>
            )}
          </div>

          <div className="chat-area">
            {messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📄</div>
                <h2>Chat with your documents</h2>
                <p>
                  Upload PDFs on the left, then ask questions about them here.
                  Select specific documents to narrow the search scope.
                </p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`message ${msg.role}`}>
                  <div className="message-role">
                    {msg.role === "user" ? "You" : "Assistant"}
                  </div>
                  {msg.role === "assistant" && msg.content === "" ? (
                    <div className="message-bubble thinking">
                      <div className="thinking-dot" />
                      <div className="thinking-dot" />
                      <div className="thinking-dot" />
                    </div>
                  ) : (
                    <div className="message-bubble">{msg.content}</div>
                  )}
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="input-area">
            <div className="input-row">
              <textarea
                ref={textareaRef}
                className="question-input"
                placeholder={documents.length === 0
                  ? "Upload a PDF first…"
                  : `Ask about ${scopeLabel.toLowerCase()}…`}
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={documents.length === 0 || chatLoading}
                rows={1}
              />
              <button
                className="send-btn"
                onClick={sendQuestion}
                disabled={!question.trim() || chatLoading || documents.length === 0}
              >
                {chatLoading ? <SpinnerIcon /> : <SendIcon />}
              </button>
            </div>
            <div className="input-hint">↵ to send · shift+↵ for newline</div>
          </div>
        </div>
      </div>
      )}
    </>
  );
}
