import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles.css";

import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthProvider.jsx";

createRoot(document.querySelector("#root")).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
