import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RestaurantLayout } from "./components/RestaurantLayout";
import { Cadastro } from "./pages/Cadastro";
import { Cardapio } from "./pages/Cardapio";
import { ConfiguracaoImpressao } from "./pages/ConfiguracaoImpressao";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { Pedidos } from "./pages/Pedidos";
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
        <Route path="/pedidos" element={<Pedidos />} />
        <Route path="/impressora" element={<ConfiguracaoImpressao />} />
      </Route>
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
