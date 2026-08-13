import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RestaurantLayout } from "./components/RestaurantLayout";
import { Cadastro } from "./pages/Cadastro";
import { Cardapio } from "./pages/Cardapio";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { Mesas } from "./pages/Mesas";
import { Welcome } from "./pages/Welcome";

function App() {
  return (
    <Routes>
      <Route path="/cadastro" element={<Cadastro />} />
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <RestaurantLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/bem-vindo" element={<Welcome />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/cardapio" element={<Cardapio />} />
        <Route path="/mesas" element={<Mesas />} />
      </Route>
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
