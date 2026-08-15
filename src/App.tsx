import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { Mesa } from "./pages/Mesa";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/loja/:restaurantId" element={<Mesa />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
