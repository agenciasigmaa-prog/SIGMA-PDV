import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RestaurantLayout } from "./components/RestaurantLayout";
import { Cadastro } from "./pages/Cadastro";
import { Cardapio } from "./pages/Cardapio";
import { Clientes } from "./pages/Clientes";
import { ConfiguracaoImpressao } from "./pages/ConfiguracaoImpressao";
import { Configuracoes } from "./pages/Configuracoes";
import { Dashboard } from "./pages/Dashboard";
import { Garcom } from "./pages/Garcom";
import { Login } from "./pages/Login";
import { Motoboy } from "./pages/Motoboy";
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
        <Route path="/garcom" element={<Garcom />} />
        <Route path="/motoboy" element={<Motoboy />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/impressora" element={<ConfiguracaoImpressao />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
      </Route>
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
