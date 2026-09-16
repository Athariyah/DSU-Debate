import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { PhoneShell } from "./components/layout/PhoneShell";
import { SplashPage } from "./pages/SplashPage";
import { HomePage } from "./pages/HomePage";
import { DebatesPage } from "./pages/DebatesPage";
import { DebateDetailPage } from "./pages/DebateDetailPage";
import { CreateDebatePage } from "./pages/CreateDebatePage";
import { ProfilePage } from "./pages/ProfilePage";
import { AdminPage } from "./pages/AdminPage";
import { BroadcastPage } from "./pages/BroadcastPage";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Экран трансляции для больших экранов: без телефонной обёртки,
            на всю площадь окна браузера (телевизор / проектор). */}
        <Route path="/broadcast/:id" element={<BroadcastPage />} />
        <Route path="*" element={<PhoneApp />} />
      </Routes>
    </BrowserRouter>
  );
}

function PhoneApp() {
  return (
    <PhoneShell>
      <Routes>
        <Route path="/" element={<SplashPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/debates" element={<DebatesPage />} />
        <Route path="/debate/:id" element={<DebateDetailPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
        <Route path="/create" element={<ProtectedRoute><CreateDebatePage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </PhoneShell>
  );
}
