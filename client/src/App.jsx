import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Terminal from './pages/Terminal';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/terminal" element={<Terminal />} />
          {/* Phase 2 */}
          {/* <Route path="/users" element={<Users />} /> */}
          {/* <Route path="/shares" element={<Shares />} /> */}
          {/* Phase 3 */}
          {/* <Route path="/rdp" element={<RemoteDesktop />} /> */}
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
