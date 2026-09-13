import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { PhoneShell } from "./components/layout/PhoneShell";
import { SplashPage } from "./pages/SplashPage";
import { HomePage } from "./pages/HomePage";
import { DebatesPage } from "./pages/DebatesPage";
import { DebateDetailPage } from "./pages/DebateDetailPage";
import { CreateDebatePage } from "./pages/CreateDebatePage";
import { ProfilePage } from "./pages/ProfilePage";

export default function App() {
  return (
    <HashRouter>
      <PhoneShell>
        <Routes>
          <Route path="/" element={<SplashPage />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/debates" element={<DebatesPage />} />
          <Route path="/debate/:id" element={<DebateDetailPage />} />
          <Route path="/create" element={<CreateDebatePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PhoneShell>
    </HashRouter>
  );
}
