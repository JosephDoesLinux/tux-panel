import { useState, useEffect } from 'react';
import { X, Settings, Server, Key, Cpu, Edit3, Sliders } from 'lucide-react';
import { useAIPrefs } from '../hooks/useAIPrefs';

export default function AISettingsModal({ isOpen, onClose }) {
  const { prefs, updatePrefs } = useAIPrefs();
  
  // Local state for edits
  const [localPrefs, setLocalPrefs] = useState({ ...prefs });

  // Sync when opened
  useEffect(() => {
    if (isOpen) {
      setLocalPrefs({ ...prefs });
    }
  }, [isOpen, prefs]);

  if (!isOpen) return null;

  const handleChange = (key, value) => {
    setLocalPrefs(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    updatePrefs(localPrefs);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gb-bg0/80 backdrop-blur-sm">
      <div className="bg-gb-bg0 border-2 border-gb-bg3 shadow-2xl flex flex-col w-full max-w-lg max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-gb-bg2 bg-gb-bg1">
          <div className="flex items-center gap-2 text-gb-fg1 font-bold">
            <Settings size={18} className="text-gb-yellow" />
            <h2>AI Assistant Configuration</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-gb-fg4 hover:text-gb-red transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-6 text-sm flex-1">
          
          {/* Provider Toggle */}
          <div className="flex items-center justify-between bg-gb-bg0 border-2 border-gb-bg2 p-4">
            <div>
              <span className="font-bold text-gb-fg1 uppercase tracking-wide text-xs block">Custom API Proxy</span>
              <span className="text-[10px] text-gb-fg4">Use an OpenAI-compatible endpoint (like Ollama) instead of Google Gemini</span>
            </div>
            <button
              type="button"
              onClick={() => handleChange('useCustomProxy', !localPrefs.useCustomProxy)}
              className={`relative w-11 h-6 border-2 transition-colors ${
                localPrefs.useCustomProxy
                  ? 'bg-gb-green border-gb-green-dim'
                  : 'bg-gb-bg2 border-gb-bg3'
              } cursor-pointer shrink-0`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 bg-gb-fg0 transition-transform ${
                  localPrefs.useCustomProxy ? 'left-5' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {/* Settings Based on Toggle */}
          <div className="space-y-4">
            {!localPrefs.useCustomProxy ? (
              /* GEMINI SETTINGS */
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-xs font-bold text-gb-fg2 uppercase tracking-wider">
                    <Cpu size={14} /> Gemini Model
                  </label>
                  <select 
                    value={localPrefs.model}
                    onChange={(e) => handleChange('model', e.target.value)}
                    className="w-full px-2 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono"
                  >
                    <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                    <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                    <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                    <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                  </select>
                </div>
              </div>
            ) : (
              /* CUSTOM PROXY SETTINGS */
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-xs font-bold text-gb-fg2 uppercase tracking-wider">
                    <Server size={14} /> API Base URL
                  </label>
                  <input 
                    type="text" 
                    placeholder="http://localhost:11434/v1"
                    value={localPrefs.proxyUrl}
                    onChange={(e) => handleChange('proxyUrl', e.target.value)}
                    className="w-full px-2 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono"
                  />
                  <p className="text-[10px] text-gb-fg4">Include /v1 at the end for Ollama/OpenAI compatibility.</p>
                </div>

                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-xs font-bold text-gb-fg2 uppercase tracking-wider">
                    <Cpu size={14} /> Model Name
                  </label>
                  <input 
                    type="text" 
                    placeholder="llama3, deepseek-coder, etc."
                    value={localPrefs.proxyModel}
                    onChange={(e) => handleChange('proxyModel', e.target.value)}
                    className="w-full px-2 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-xs font-bold text-gb-fg2 uppercase tracking-wider">
                    <Key size={14} /> API Key (Optional)
                  </label>
                  <input 
                    type="password" 
                    placeholder="sk-..."
                    value={localPrefs.proxyApiKey}
                    onChange={(e) => handleChange('proxyApiKey', e.target.value)}
                    className="w-full px-2 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono"
                  />
                </div>
              </div>
            )}

            {/* COMMON GENERATION PARAMETERS */}
            <div className="pt-4 border-t-2 border-gb-bg2 space-y-5">
              <h3 className="text-sm font-bold text-gb-fg1 uppercase flex items-center gap-2">
                <Sliders size={16} className="text-gb-blue" />
                Generation Parameters
              </h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gb-fg2 uppercase tracking-wider">Temperature: {Number(localPrefs.temperature).toFixed(2)}</label>
                  <span className="text-[10px] text-gb-fg4 uppercase">Focus &rarr; Creativity</span>
                </div>
                <input 
                  type="range" 
                  min="0" max="2" step="0.1"
                  value={localPrefs.temperature}
                  onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
                  className="w-full accent-gb-blue h-1.5 bg-gb-bg3 appearance-none cursor-pointer"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gb-fg2 uppercase tracking-wider">Top P: {Number(localPrefs.topP).toFixed(2)}</label>
                  <span className="text-[10px] text-gb-fg4 uppercase">Strict &rarr; Diverse</span>
                </div>
                <input 
                  type="range" 
                  min="0" max="1" step="0.05"
                  value={localPrefs.topP}
                  onChange={(e) => handleChange('topP', parseFloat(e.target.value))}
                  className="w-full accent-gb-blue h-1.5 bg-gb-bg3 appearance-none cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-2 text-xs font-bold text-gb-fg2 uppercase tracking-wider">
                  <Edit3 size={14} /> System Prompt Override
                </label>
                <textarea 
                  placeholder="Leave empty to use the default system prompt."
                  value={localPrefs.systemPrompt}
                  onChange={(e) => handleChange('systemPrompt', e.target.value)}
                  rows={4}
                  className="w-full px-2 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono resize-y"
                />
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t-2 border-gb-bg2 bg-gb-bg1 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase border-2 border-gb-green-dim bg-gb-green text-gb-bg0-hard hover:opacity-90 transition-colors"
          >
            Save Configuration
          </button>
        </div>

      </div>
    </div>
  );
}
