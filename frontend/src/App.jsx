import { useEffect, useState, createContext, useContext } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage.jsx";
import ClinicPage from "./pages/ClinicPage.jsx";
import IncomePage from "./pages/IncomePage.jsx";
import OutcomePage from "./pages/OutcomePage.jsx";
import StaffPage from "./pages/StaffPage.jsx";
import DoctorPage from "./pages/DoctorPage.jsx";
import AdministratorPage from "./pages/AdministratorPage.jsx";
import AssistantPage from "./pages/AssistantPage.jsx";
import StaffIncomeDashboard from "./pages/StaffIncomeDashboard.jsx";
import Layout from "./components/Layout.jsx";

const AuthContext = createContext(null);

function useAuth() {
  return useContext(AuthContext);
}

function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  });

  const login = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem("token", newToken);
    localStorage.setItem("user", JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  };

  const value = { token, user, login, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function ProtectedRoute({ children }) {
  return children;
}

function AppRoutes() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/clinic", { replace: true });
  }, []);

  return (
    <Layout>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/clinic"
          element={
            <ProtectedRoute>
              <ClinicPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/income"
          element={
            <ProtectedRoute>
              <IncomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/outcome"
          element={
            <ProtectedRoute>
              <OutcomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff"
          element={
            <ProtectedRoute>
              <StaffPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff/doctor/:id"
          element={
            <ProtectedRoute>
              <DoctorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff/administrator/:id"
          element={
            <ProtectedRoute>
              <AdministratorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff/assistant/:id"
          element={
            <ProtectedRoute>
              <AssistantPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-income"
          element={
            <ProtectedRoute>
              <StaffIncomeDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="*"
          element={
            <ProtectedRoute>
              <Navigate to="/clinic" replace />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export { useAuth };

