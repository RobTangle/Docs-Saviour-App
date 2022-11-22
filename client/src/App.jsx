import i18next from "./i18next";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Landing } from "./views";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
