import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./components/AdminLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuditLog } from "./pages/AuditLog";
import { Clientes } from "./pages/Clientes";
import { Dashboard } from "./pages/Dashboard";
import { Kanban } from "./pages/Kanban";
import { Login } from "./pages/Login";
import { Orders } from "./pages/Orders";
import { Restaurants } from "./pages/Restaurants";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/kanban" element={<Kanban />} />
        <Route path="/restaurantes" element={<Restaurants />} />
        <Route path="/pedidos" element={<Orders />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/auditoria" element={<AuditLog />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
