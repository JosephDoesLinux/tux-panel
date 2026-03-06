import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Synchronises a tab state with the URL `?tab=` query parameter.
 *
 * @param {string[]} validTabs  Array of valid tab key strings
 * @param {string}   defaultTab The default tab when none is specified
 * @returns {[string, (tab: string) => void]}  [activeTab, setTab]
 */
export default function useTabSync(validTabs, defaultTab) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, _setTab] = useState(() => {
    const t = searchParams.get('tab');
    return t && validTabs.includes(t) ? t : defaultTab;
  });

  const setTab = (t) => {
    _setTab(t);
    setSearchParams({ tab: t }, { replace: true });
  };

  // Sync tab when sidebar navigates with ?tab=
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && validTabs.includes(t)) _setTab(t);
  }, [searchParams, validTabs]);

  return [tab, setTab];
}
