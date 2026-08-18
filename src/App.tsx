import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { Mesa } from "./pages/Mesa";
import { resolveSlugFromHostname } from "./lib/subdomain";

// Calculado uma vez — o hostname não muda durante a navegação da SPA.
const restaurantSlug = resolveSlugFromHostname(window.location.hostname, import.meta.env.VITE_APEX_DOMAIN);

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={restaurantSlug ? <Mesa slug={restaurantSlug} /> : <Home />} />
        <Route path="/loja/:restaurantId" element={<Mesa />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
