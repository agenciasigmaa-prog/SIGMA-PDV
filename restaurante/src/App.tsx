import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RestaurantLayout } from "./components/RestaurantLayout";
import { Cadastro } from "./pages/Cadastro";
import { Cardapio } from "./pages/Cardapio";
import { Clientes } from "./pages/Clientes";
import { Cobranca } from "./pages/Cobranca";
import { ConfiguracaoImpressao } from "./pages/ConfiguracaoImpressao";
import { Configuracoes } from "./pages/Configuracoes";
import { Dashboard } from "./pages/Dashboard";
import { Garcom } from "./pages/Garcom";
import { GoogleSignInBridge } from "./pages/GoogleSignInBridge";
import { Login } from "./pages/Login";
import { Marketing } from "./pages/Marketing";
import { Motoboy } from "./pages/Motoboy";
import { Pedidos } from "./pages/Pedidos";
import { Privacidade } from "./pages/Privacidade";
import { Termos } from "./pages/Termos";
import { Welcome } from "./pages/Welcome";

function App() {
  return (
    <Routes>
      <Route path="/cadastro" element={<Cadastro />} />
      <Route path="/login" element={<Login />} />
      <Route path="/privacidade" element={<Privacidade />} />
      <Route path="/termos" element={<Termos />} />
      <Route path="/google-signin-bridge" element={<GoogleSignInBridge />} />
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
        <Route path="/cobranca" element={<Cobranca />} />
        <Route path="/marketing" element={<Marketing />} />
        <Route path="/impressora" element={<ConfiguracaoImpressao />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
      </Route>
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
