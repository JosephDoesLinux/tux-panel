import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Terminal from './pages/Terminal';
import RemoteDesktop from './pages/RemoteDesktop';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/terminal" element={<Terminal />} />
          <Route path="/rdp" element={<RemoteDesktop />} />
          {/* Phase 2 */}
          {/* <Route path="/users" element={<Users />} /> */}
          {/* <Route path="/shares" element={<Shares />} /> */}
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
