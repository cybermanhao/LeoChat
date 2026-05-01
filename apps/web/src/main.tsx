import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/globals.css";
import { useThemeStore } from "./stores/theme";

// Apply persisted theme synchronously before first render so the loading
// screen already uses the correct colors (no flash of default theme).
const { currentTheme, applyTheme } = useThemeStore.getState();
applyTheme(currentTheme);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
