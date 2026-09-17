import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import { PhoneShell } from "./components/layout/PhoneShell";
import { SplashPage } from "./pages/SplashPage";
import { HomePage } from "./pages/HomePage";
import { DebatesPage } from "./pages/DebatesPage";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";

// Code splitting: тяжёлые экраны грузятся лениво, уменьшая начальный бандл
const DebateDetailPage = lazy(() => import("./pages/DebateDetailPage").then(m => ({ default: m.DebateDetailPage })));
const CreateDebatePage = lazy(() => import("./pages/CreateDebatePage").then(m => ({ default: m.CreateDebatePage })));
const ProfilePage = lazy(() => import("./pages/ProfilePage").then(m => ({ default: m.ProfilePage })));
const AdminPage = lazy(() => import("./pages/AdminPage").then(m => ({ default: m.AdminPage })));
const BroadcastPage = lazy(() => import("./pages/BroadcastPage").then(m => ({ default: m.BroadcastPage })));

function LoadingFallback() {
  return <div className="flex h-full items-center justify-center text-sm text-white/40">Загрузка...</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* Экран трансляции для больших экранов: без телефонной обёртки,
              на всю площадь окна браузера (телевизор / проектор). */}
          <Route path="/broadcast/:id" element={<BroadcastPage />} />
          <Route path="*" element={<PhoneApp />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

function PhoneApp() {
  return (
    <PhoneShell>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<SplashPage />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/debates" element={<DebatesPage />} />
          <Route path="/events" element={<DebatesPage />} />
          <Route path="/debate/:id" element={<DebateDetailPage />} />
          <Route path="/event/:id" element={<DebateDetailPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
          <Route path="/create" element={<ProtectedRoute><CreateDebatePage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </PhoneShell>
  );
}
