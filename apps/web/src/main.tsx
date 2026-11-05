import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
// token 正本在设计系统目录里，不在 src 下另存副本。
import "../design/itei/itei-design-system/tokens.css";
import "./itei-app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
