/**
 * SemanticConfigForm — Schema-driven config editor with proper UI controls.
 *
 * Parses a config file into structured fields based on a schema definition,
 * renders toggle switches, number inputs, select dropdowns, and text fields
 * grouped into logical sections. Includes a "Raw Mode" toggle to fall back
 * to the existing ConfigEditorTab.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Activity, AlertCircle, Check, Save, RotateCcw, RefreshCw,
  Code, Settings, Shield, Zap, Globe, ChevronDown, ChevronUp,
} from 'lucide-react';
import api from '../lib/api';
import ConfigEditorTab from './ConfigEditorTab';

/* ── Config Schemas ──────────────────────────────────────────────── */

const SSH_SCHEMA = {
  sections: [
    {
      title: 'Security', icon: Shield, color: 'text-gb-red',
      fields: [
        { key: 'PermitRootLogin',           label: 'Allow Root Login',            type: 'select', options: ['yes', 'no', 'prohibit-password', 'forced-commands-only'], default: 'prohibit-password', description: 'Whether root can log in via SSH' },
        { key: 'PasswordAuthentication',    label: 'Password Authentication',     type: 'toggle', default: 'yes', description: 'Allow password-based login (disable for key-only)' },
        { key: 'PubkeyAuthentication',      label: 'Public Key Authentication',   type: 'toggle', default: 'yes', description: 'Allow SSH key-based login' },
        { key: 'PermitEmptyPasswords',      label: 'Allow Empty Passwords',       type: 'toggle', default: 'no',  description: 'Allow accounts with no password' },
        { key: 'ChallengeResponseAuthentication', label: 'Challenge-Response Auth', type: 'toggle', default: 'no', description: 'PAM-based challenge-response authentication' },
        { key: 'UsePAM',                    label: 'Use PAM',                     type: 'toggle', default: 'yes', description: 'Pluggable Authentication Modules' },
        { key: 'StrictModes',               label: 'Strict Modes',                type: 'toggle', default: 'yes', description: 'Check file permissions before accepting login' },
        { key: 'MaxAuthTries',              label: 'Max Auth Attempts',           type: 'number', default: '6',   min: 1, max: 100, description: 'Maximum authentication attempts per connection' },
        { key: 'LoginGraceTime',            label: 'Login Grace Time (sec)',      type: 'number', default: '120', min: 0, max: 600, description: 'Seconds before login times out (0 = no limit)' },
      ],
    },
    {
      title: 'Network', icon: Globe, color: 'text-gb-blue',
      fields: [
        { key: 'Port',                      label: 'SSH Port',                    type: 'number', default: '22',  min: 1, max: 65535, description: 'Port number for the SSH daemon' },
        { key: 'AddressFamily',             label: 'Address Family',              type: 'select', options: ['any', 'inet', 'inet6'], default: 'any', description: 'Which IP protocol to use' },
        { key: 'ListenAddress',             label: 'Listen Address',              type: 'text',   default: '0.0.0.0', description: 'IP address to bind to (0.0.0.0 = all interfaces)' },
        { key: 'TCPKeepAlive',              label: 'TCP Keep-Alive',              type: 'toggle', default: 'yes', description: 'Send TCP keepalive messages' },
        { key: 'ClientAliveInterval',       label: 'Client Alive Interval (sec)', type: 'number', default: '0',   min: 0, max: 3600, description: 'Seconds between keep-alive probes (0 = disabled)' },
        { key: 'ClientAliveCountMax',       label: 'Client Alive Count Max',      type: 'number', default: '3',   min: 0, max: 100, description: 'Max unanswered probes before disconnect' },
      ],
    },
    {
      title: 'Features', icon: Zap, color: 'text-gb-yellow',
      fields: [
        { key: 'X11Forwarding',             label: 'X11 Forwarding',              type: 'toggle', default: 'no',  description: 'Allow X11 graphical forwarding' },
        { key: 'AllowTcpForwarding',        label: 'TCP Forwarding',              type: 'toggle', default: 'yes', description: 'Allow SSH tunnel / port forwarding' },
        { key: 'GatewayPorts',              label: 'Gateway Ports',               type: 'toggle', default: 'no',  description: 'Allow remote hosts to connect to forwarded ports' },
        { key: 'AllowAgentForwarding',      label: 'Agent Forwarding',            type: 'toggle', default: 'yes', description: 'Allow forwarding the SSH agent' },
        { key: 'PrintMotd',                 label: 'Print MOTD',                  type: 'toggle', default: 'yes', description: 'Show message of the day on login' },
        { key: 'PrintLastLog',              label: 'Print Last Login',            type: 'toggle', default: 'yes', description: 'Show last login info on connect' },
        { key: 'Compression',               label: 'Compression',                 type: 'toggle', default: 'yes', description: 'Enable zlib compression' },
        { key: 'MaxSessions',               label: 'Max Sessions',                type: 'number', default: '10',  min: 1, max: 100, description: 'Max multiplexed sessions per connection' },
        { key: 'MaxStartups',               label: 'Max Startups',                type: 'text',   default: '10:30:100', description: 'Rate-limit unauthenticated connections (start:rate:full)' },
      ],
    },
  ],
};

const SMB_SCHEMA = {
  sections: [
    {
      title: 'Global', icon: Globe, color: 'text-gb-blue',
      fields: [
        { key: 'workgroup',          label: 'Workgroup',              type: 'text',   default: 'SAMBA',   section: 'global', description: 'Windows workgroup name' },
        { key: 'server string',      label: 'Server Description',     type: 'text',   default: 'Samba Server', section: 'global', description: 'Text identifying this server' },
        { key: 'server role',        label: 'Server Role',            type: 'select', options: ['standalone server', 'member server', 'classic primary domain controller', 'active directory domain controller'], default: 'standalone server', section: 'global', description: 'Samba role in the network' },
        { key: 'netbios name',       label: 'NetBIOS Name',           type: 'text',   default: '',        section: 'global', description: 'Machine name visible on the network' },
      ],
    },
    {
      title: 'Security', icon: Shield, color: 'text-gb-red',
      fields: [
        { key: 'security',           label: 'Security Mode',          type: 'select', options: ['user', 'domain', 'ads'], default: 'user', section: 'global', description: 'Authentication security model' },
        { key: 'passdb backend',     label: 'Password Backend',       type: 'select', options: ['tdbsam', 'ldapsam', 'smbpasswd'], default: 'tdbsam', section: 'global', description: 'Where user passwords are stored' },
        { key: 'map to guest',       label: 'Map to Guest',           type: 'select', options: ['Never', 'Bad User', 'Bad Password', 'Bad Uid'], default: 'Never', section: 'global', description: 'When to map anonymous access to guest' },
        { key: 'guest account',      label: 'Guest Account',          type: 'text',   default: 'nobody',  section: 'global', description: 'Unix user for guest access' },
        { key: 'usershare allow guests', label: 'Allow Guest Shares', type: 'toggle', default: 'no',      section: 'global', description: 'Allow user shares to be accessed by guests' },
      ],
    },
    {
      title: 'Performance', icon: Zap, color: 'text-gb-yellow',
      fields: [
        { key: 'log level',          label: 'Log Verbosity',          type: 'number', default: '1',   min: 0, max: 10, section: 'global', description: 'Detail level for log output (0=minimal, 10=debug)' },
        { key: 'max log size',       label: 'Max Log Size (KB)',      type: 'number', default: '5000', min: 0, max: 100000, section: 'global', description: 'Maximum log file size before rotation' },
        { key: 'printing',           label: 'Printing System',        type: 'select', options: ['cups', 'bsd', 'lprng', 'sysv'], default: 'cups', section: 'global', description: 'Print subsystem to use' },
        { key: 'load printers',      label: 'Load Printers',          type: 'toggle', default: 'yes', section: 'global', description: 'Auto-load printers from the print system' },
      ],
    },
  ],
};

const NFS_SCHEMA = {
  sections: [
    {
      title: 'Exports', icon: Globe, color: 'text-gb-blue',
      fields: [],  // NFS exports are line-based, handled differently
      note: 'NFS exports use a line-based format: /path host(options). Use the Raw Editor or the Shares tab to manage exports.',
    },
  ],
};

const CONFIG_SCHEMAS = { ssh: SSH_SCHEMA, smb: SMB_SCHEMA, nfs: NFS_SCHEMA, ftp: null };

/* ── Parser: config text → key-value map ─────────────────────────── */

function parseConfig(configName, text) {
  const values = {};
  if (!text) return values;

  if (configName === 'smb') {
    // INI-style: [section] then key = value
    const lines = text.split('\n');
    let currentSection = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
      const sectionMatch = trimmed.match(/^\[(.+)]$/);
      if (sectionMatch) { currentSection = sectionMatch[1].toLowerCase(); continue; }
      const kvMatch = trimmed.match(/^([^=]+?)\s*=\s*(.+)$/);
      if (kvMatch && currentSection === 'global') {
        values[kvMatch[1].trim().toLowerCase()] = kvMatch[2].trim();
      }
    }
  } else {
    // ssh/ftp style: Key Value (space-separated)
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^(\S+)\s+(.+)$/);
      if (match) {
        values[match[1]] = match[2];
      }
    }
  }
  return values;
}

/* ── Serializer: form values → config text ───────────────────────── */

function serializeConfig(configName, originalText, formValues) {
  if (!originalText) return originalText;

  if (configName === 'smb') {
    let result = originalText;
    for (const [key, val] of Object.entries(formValues)) {
      // Match "key = value" in [global] section
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`^(\\s*${escaped}\\s*=\\s*)(.+)$`, 'im');
      if (re.test(result)) {
        result = result.replace(re, `$1${val}`);
      } else {
        // Insert into [global] section if not present
        const globalIdx = result.toLowerCase().indexOf('[global]');
        if (globalIdx !== -1) {
          const insertAt = result.indexOf('\n', globalIdx) + 1;
          result = result.slice(0, insertAt) + `        ${key} = ${val}\n` + result.slice(insertAt);
        }
      }
    }
    return result;
  } else {
    // SSH/FTP style: Key Value
    let result = originalText;
    for (const [key, val] of Object.entries(formValues)) {
      const re = new RegExp(`^(#?\\s*${key}\\s+)(.+)$`, 'im');
      if (re.test(result)) {
        result = result.replace(re, `${key} ${val}`);
      } else {
        // Add at end if not present
        result = result.trimEnd() + `\n${key} ${val}\n`;
      }
    }
    return result;
  }
}

/* ── Toggle Component ────────────────────────────────────────────── */

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative w-11 h-6 border-2 transition-colors ${
        checked
          ? 'bg-gb-green border-gb-green-dim'
          : 'bg-gb-bg2 border-gb-bg3'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 bg-gb-fg0 transition-transform ${
          checked ? 'left-5' : 'left-0.5'
        }`}
      />
    </button>
  );
}

/* ── Main Component ──────────────────────────────────────────────── */

export default function SemanticConfigForm({ configName }) {
  const schema = CONFIG_SCHEMAS[configName];

  // If no schema or schema has no meaningful fields, show raw editor
  const hasFormFields = schema?.sections?.some(s => s.fields.length > 0);

  const [rawMode, setRawMode] = useState(!hasFormFields);
  const [data, setData] = useState(null);
  const [originalContent, setOriginalContent] = useState('');
  const [formValues, setFormValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [restartOnSave, setRestartOnSave] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState({});

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/services/config/${configName}`);
      setData(res.data);
      setOriginalContent(res.data.content || '');

      // Parse values from config text
      if (hasFormFields) {
        const parsed = parseConfig(configName, res.data.content || '');
        const defaults = {};
        for (const section of schema.sections) {
          for (const field of section.fields) {
            const key = configName === 'smb' ? field.key.toLowerCase() : field.key;
            defaults[field.key] = parsed[key] ?? field.default;
          }
        }
        setFormValues(defaults);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [configName, schema, hasFormFields]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  // Clear success after 4s
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  function updateField(key, value) {
    setFormValues(prev => ({ ...prev, [key]: value }));
    setSuccess(null);
  }

  function toggleSection(title) {
    setCollapsedSections(prev => ({ ...prev, [title]: !prev[title] }));
  }

  const dirty = useMemo(() => {
    if (!data) return false;
    const current = serializeConfig(configName, originalContent, formValues);
    return current !== originalContent;
  }, [configName, originalContent, formValues, data]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const content = serializeConfig(configName, originalContent, formValues);
      const res = await api.put(`/api/services/config/${configName}`, { content, restart: restartOnSave });
      if (res.data.warning) {
        setSuccess(`Saved with warning: ${res.data.warning}`);
      } else {
        setSuccess('Configuration saved successfully');
      }
      setOriginalContent(content);
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.validationOutput) {
        setError(`Syntax error — changes reverted:\n${errData.validationOutput}`);
      } else {
        setError(errData?.error || err.message);
      }
    } finally {
      setSaving(false);
    }
  }

  // If in raw mode, delegate entirely to ConfigEditorTab
  if (rawMode) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          {hasFormFields && (
            <button
              onClick={() => { setRawMode(false); fetchConfig(); }}
              className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase border-2 border-gb-purple-dim bg-gb-bg1 text-gb-purple hover:bg-gb-bg2 transition-colors"
            >
              <Settings size={14} />
              Form Mode
            </button>
          )}
        </div>
        <ConfigEditorTab configName={configName} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gb-fg4 mt-4">
        <Activity size={18} className="animate-pulse" /> Loading configuration…
      </div>
    );
  }

  if (!data?.installed) {
    return (
      <div className="bg-gb-bg0 border-2 border-gb-bg2 p-8 text-center">
        <Settings size={48} className="mx-auto mb-4 text-gb-bg4" />
        <h2 className="text-lg font-bold text-gb-fg2 mb-2">{data?.label || configName} Not Installed</h2>
        <p className="text-sm text-gb-fg4">
          Config file not found at <code className="text-gb-aqua bg-gb-bg1 px-1.5 py-0.5">{data?.path}</code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header bar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Service status */}
        <span className={`flex items-center gap-1.5 text-xs font-bold uppercase ${data.serviceActive ? 'text-gb-green' : 'text-gb-red'}`}>
          <span className={`w-2 h-2 ${data.serviceActive ? 'bg-gb-green' : 'bg-gb-red'}`} />
          {data.service}: {data.serviceActive ? 'Running' : 'Stopped'}
        </span>

        <div className="flex-1" />

        {/* Restart on save toggle */}
        <label className="flex items-center gap-2 text-xs text-gb-fg3 font-bold uppercase cursor-pointer">
          <Toggle checked={restartOnSave} onChange={setRestartOnSave} />
          Restart on Save
        </label>

        {/* Raw mode toggle */}
        <button
          onClick={() => setRawMode(true)}
          className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors"
        >
          <Code size={14} />
          Raw Mode
        </button>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase border-2 border-gb-green-dim bg-gb-green text-gb-bg0-hard hover:opacity-90 transition-colors disabled:opacity-40"
        >
          {saving ? <Activity size={14} className="animate-pulse" /> : <Save size={14} />}
          {saving ? 'Validating…' : 'Save'}
        </button>

        {/* Refresh */}
        <button
          onClick={fetchConfig}
          className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* ── Messages ───────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-2 text-gb-red bg-gb-bg1 border-2 border-gb-red-dim p-3 text-sm">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <pre className="whitespace-pre-wrap font-mono text-xs">{error}</pre>
          <button onClick={() => setError(null)} className="ml-auto text-gb-fg4 hover:text-gb-fg1 shrink-0">✕</button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-gb-green bg-gb-bg1 border-2 border-gb-green-dim p-3 text-sm">
          <Check size={16} />
          {success}
        </div>
      )}

      {/* ── Sections ───────────────────────────────────────────── */}
      {schema.sections.map((section) => {
        const SectionIcon = section.icon;
        const isCollapsed = collapsedSections[section.title];

        return (
          <div key={section.title} className="bg-gb-bg0 border-2 border-gb-bg2">
            {/* Section header */}
            <button
              onClick={() => toggleSection(section.title)}
              className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-gb-bg1 transition-colors"
            >
              <SectionIcon size={18} className={section.color} />
              <span className="text-sm font-black uppercase tracking-wide text-gb-fg1">{section.title}</span>
              <span className="ml-auto text-gb-fg4">
                {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </span>
            </button>

            {/* Section note */}
            {section.note && !isCollapsed && (
              <div className="px-4 pb-3 text-xs text-gb-fg4">{section.note}</div>
            )}

            {/* Fields */}
            {!isCollapsed && section.fields.length > 0 && (
              <div className="border-t-2 border-gb-bg2">
                {section.fields.map((field, i) => {
                  const value = formValues[field.key] ?? field.default;
                  const isLast = i === section.fields.length - 1;

                  return (
                    <div
                      key={field.key}
                      className={`flex items-center gap-4 px-4 py-3 ${!isLast ? 'border-b border-gb-bg2' : ''} hover:bg-gb-bg1/50 transition-colors`}
                    >
                      {/* Label + description */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-gb-fg1">{field.label}</div>
                        {field.description && (
                          <div className="text-xs text-gb-fg4 mt-0.5">{field.description}</div>
                        )}
                      </div>

                      {/* Input control */}
                      <div className="shrink-0 w-48">
                        {field.type === 'toggle' ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-gb-fg4 font-mono">
                              {value === 'yes' ? 'Enabled' : 'Disabled'}
                            </span>
                            <Toggle
                              checked={value === 'yes'}
                              onChange={(checked) => updateField(field.key, checked ? 'yes' : 'no')}
                            />
                          </div>
                        ) : field.type === 'select' ? (
                          <select
                            value={value}
                            onChange={(e) => updateField(field.key, e.target.value)}
                            className="w-full px-2 py-1.5 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none"
                          >
                            {field.options.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : field.type === 'number' ? (
                          <input
                            type="number"
                            value={value}
                            onChange={(e) => updateField(field.key, e.target.value)}
                            min={field.min}
                            max={field.max}
                            className="w-full px-2 py-1.5 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm font-mono focus:border-gb-aqua outline-none"
                          />
                        ) : (
                          <input
                            type="text"
                            value={value}
                            onChange={(e) => updateField(field.key, e.target.value)}
                            className="w-full px-2 py-1.5 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm font-mono focus:border-gb-aqua outline-none"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
