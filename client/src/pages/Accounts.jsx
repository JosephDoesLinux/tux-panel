import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users,
  UserPlus,
  Shield,
  Trash2,
  Activity,
  RefreshCw,
  AlertCircle,
  Key,
  Search,
  ChevronRight,
} from 'lucide-react';
import api from '../lib/api';

/* ── Helpers ─────────────────────────────────────────────────────── */

function SectionHeader({ icon: Icon, title, color = 'text-gb-aqua', children }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Icon size={20} className={color} />
        <h2 className="text-lg font-black uppercase tracking-tight text-gb-fg1">{title}</h2>
      </div>
      {children}
    </div>
  );
}

/* ── Create User Modal ───────────────────────────────────────────── */

function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    username: '',
    shell: '/bin/bash',
    groups: '',
    createHome: true,
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/api/accounts/users', form);
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="bg-gb-bg0 border-2 border-gb-bg3 p-6 w-110 shadow-xl"
      >
        <h2 className="text-lg font-black text-gb-fg0 uppercase mb-4">New User</h2>

        {error && (
          <div className="flex items-center gap-2 text-gb-red bg-gb-bg1 border-2 border-gb-red-dim p-3 mb-4 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Username</label>
            <input
              required
              value={form.username}
              onChange={(e) => set('username', e.target.value)}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none"
              placeholder="newuser"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Shell</label>
            <select
              value={form.shell}
              onChange={(e) => set('shell', e.target.value)}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none"
            >
              <option value="/bin/bash">/bin/bash</option>
              <option value="/bin/zsh">/bin/zsh</option>
              <option value="/bin/fish">/bin/fish</option>
              <option value="/sbin/nologin">/sbin/nologin</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Groups (comma-separated)</label>
            <input
              value={form.groups}
              onChange={(e) => set('groups', e.target.value)}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none"
              placeholder="wheel, tuxpanel"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gb-fg2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.createHome}
              onChange={(e) => set('createHome', e.target.checked)}
              className="accent-gb-aqua"
            />
            Create home directory
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg3 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-bold border-2 border-gb-aqua-dim bg-gb-aqua text-gb-bg0-hard hover:opacity-90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create User'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Main Accounts Page ──────────────────────────────────────────── */

export default function Accounts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, _setTab] = useState(() => searchParams.get('tab') || 'users');
  const setTab = (t) => { _setTab(t); setSearchParams({ tab: t }, { replace: true }); };

  // Sync tab when sidebar navigates with ?tab=
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && ['users', 'groups', 'firewall'].includes(t)) _setTab(t);
  }, [searchParams]);
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [firewall, setFirewall] = useState(null);
  const [firewallRules, setFirewallRules] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchUsers = useCallback(async () => {
    try {
      const [usersRes, groupsRes] = await Promise.all([
        api.get('/api/accounts/users'),
        api.get('/api/accounts/groups'),
      ]);
      setUsers(usersRes.data.users || []);
      setGroups(groupsRes.data.groups || []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const fetchFirewall = useCallback(async () => {
    try {
      const [fwRes, rulesRes] = await Promise.all([
        api.get('/api/accounts/firewall'),
        api.get('/api/accounts/firewall/rules'),
      ]);
      setFirewall(fwRes.data);
      setFirewallRules(rulesRes.data.rules || '');
    } catch {
      setFirewall({ running: false, zones: [] });
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const promises =
      tab === 'users' || tab === 'groups'
        ? [fetchUsers()]
        : [fetchFirewall()];
    Promise.all(promises).finally(() => setLoading(false));
  }, [tab, fetchUsers, fetchFirewall]);

  async function handleDeleteUser(username) {
    try {
      await api.delete(`/api/accounts/users/${encodeURIComponent(username)}`);
      setDeleteConfirm(null);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }

  const filteredUsers = users.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.comment?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <h1 className="text-2xl font-black uppercase tracking-tight mb-6 text-gb-fg1">
        Accounts & Security
      </h1>

      {/* ── Tab bar ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-4">
        {[
          { key: 'users', icon: Users, label: 'Users' },
          { key: 'groups', icon: Key, label: 'Groups' },
          { key: 'firewall', icon: Shield, label: 'Firewall' },
        ].map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-bold uppercase border-2 transition-colors ${
              tab === key
                ? 'bg-gb-bg1 text-gb-aqua border-gb-aqua-dim'
                : 'bg-gb-bg0 text-gb-fg4 border-gb-bg3 hover:text-gb-fg1 hover:bg-gb-bg1'
            }`}
          >
            <span className="flex items-center gap-2">
              <Icon size={16} />
              {label}
            </span>
          </button>
        ))}

        <div className="flex-1" />

        {(tab === 'users' || tab === 'groups') && (
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gb-fg4" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter…"
              className="pl-9 pr-3 py-2 w-52 text-sm bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 focus:border-gb-aqua outline-none"
            />
          </div>
        )}

        {tab === 'users' && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase border-2 border-gb-aqua-dim bg-gb-bg1 text-gb-aqua hover:bg-gb-bg2 transition-colors"
          >
            <UserPlus size={14} />
            New User
          </button>
        )}

        <button
          onClick={() => {
            setLoading(true);
            (tab === 'firewall' ? fetchFirewall() : fetchUsers()).finally(() => setLoading(false));
          }}
          className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-gb-red bg-gb-bg1 border-2 border-gb-red-dim p-3 mb-4 text-sm">
          <AlertCircle size={16} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-gb-fg4 hover:text-gb-fg1">✕</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gb-fg4 mt-8">
          <Activity size={18} className="animate-pulse" />
          Loading…
        </div>
      ) : tab === 'users' ? (
        /* ── Users Table ───────────────────────────────────────── */
        <div className="bg-gb-bg0 border-2 border-gb-bg2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gb-bg2">
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Username</th>
                <th className="text-right px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">UID</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Comment</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Home</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Shell</th>
                <th className="text-center px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-16">—</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.username} className="border-b border-gb-bg2 hover:bg-gb-bg1 transition-colors">
                  <td className="px-4 py-2.5 text-gb-fg1 font-bold">
                    {u.username}
                    {u.uid === 0 && (
                      <span className="ml-2 text-xs text-gb-red font-bold uppercase border border-gb-red-dim px-1">root</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gb-fg3 text-right font-mono">{u.uid}</td>
                  <td className="px-4 py-2.5 text-gb-fg3">{u.comment || '—'}</td>
                  <td className="px-4 py-2.5 text-gb-fg3 font-mono text-xs">{u.home}</td>
                  <td className="px-4 py-2.5 text-gb-fg3 font-mono text-xs">{u.shell}</td>
                  <td className="px-4 py-2.5 text-center">
                    {u.uid !== 0 && (
                      <button
                        onClick={() => setDeleteConfirm(u.username)}
                        className="p-1 text-gb-fg4 hover:text-gb-red transition-colors"
                        title="Delete user"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gb-fg4">No users found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : tab === 'groups' ? (
        /* ── Groups Table ──────────────────────────────────────── */
        <div className="bg-gb-bg0 border-2 border-gb-bg2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gb-bg2">
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Group</th>
                <th className="text-right px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">GID</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Members</th>
              </tr>
            </thead>
            <tbody>
              {filteredGroups.map((g) => (
                <tr key={g.name} className="border-b border-gb-bg2 hover:bg-gb-bg1 transition-colors">
                  <td className="px-4 py-2.5 text-gb-fg1 font-bold">{g.name}</td>
                  <td className="px-4 py-2.5 text-gb-fg3 text-right font-mono">{g.gid}</td>
                  <td className="px-4 py-2.5 text-gb-fg3">
                    {g.members.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {g.members.map((m) => (
                          <span key={m} className="px-2 py-0.5 text-xs bg-gb-bg2 text-gb-fg2 font-mono">{m}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gb-fg4">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredGroups.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-gb-fg4">No groups found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Firewall ──────────────────────────────────────────── */
        <div>
          <div className="bg-gb-bg0 border-2 border-gb-bg2 p-5 mb-4">
            <div className="flex items-center gap-3 mb-3">
              <Shield size={20} className={firewall?.running ? 'text-gb-green' : 'text-gb-red'} />
              <span className="text-sm font-semibold text-gb-fg3 uppercase tracking-wide">
                firewalld Status
              </span>
              <span className={`ml-auto flex items-center gap-1.5 text-sm font-bold uppercase ${firewall?.running ? 'text-gb-green' : 'text-gb-red'}`}>
                <span className={`w-2.5 h-2.5 ${firewall?.running ? 'bg-gb-green' : 'bg-gb-red'}`} />
                {firewall?.running ? 'Active' : 'Inactive'}
              </span>
            </div>
            {firewall?.zones?.length > 0 && (
              <div className="mt-2">
                <span className="text-xs text-gb-fg4 uppercase">Default Zone: </span>
                <span className="text-sm font-bold text-gb-aqua">{firewall.zones[0]?.name}</span>
              </div>
            )}
          </div>

          {firewallRules && (
            <div className="bg-gb-bg0 border-2 border-gb-bg2 p-5">
              <h3 className="text-sm font-bold text-gb-fg3 uppercase mb-3">Active Rules</h3>
              <pre className="text-xs text-gb-fg2 font-mono whitespace-pre-wrap leading-relaxed">
                {firewallRules}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────── */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            fetchUsers();
          }}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gb-bg0 border-2 border-gb-bg3 p-6 w-96 shadow-xl">
            <h2 className="text-lg font-black text-gb-fg0 uppercase mb-2">Delete User</h2>
            <p className="text-sm text-gb-fg2 mb-6">
              Are you sure you want to delete user{' '}
              <span className="font-bold text-gb-red">{deleteConfirm}</span>?
              Their home directory will also be removed.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-bold border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg3 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteUser(deleteConfirm)}
                className="px-4 py-2 text-sm font-bold border-2 border-gb-red-dim bg-gb-red text-gb-bg0-hard hover:opacity-90 transition-colors"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
