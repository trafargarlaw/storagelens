import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// Create a new router instance
const router = createRouter({ routeTree });

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Follow the OS light/dark setting.
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
const applyColorScheme = () => document.documentElement.classList.toggle("dark", darkQuery.matches);
applyColorScheme();
darkQuery.addEventListener("change", applyColorScheme);

async function start() {
  // In a plain browser (`pnpm dev` without Tauri), serve fake data so the UI can be previewed.
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
    await import("./dev/mock-tauri");
  }

  // Render the app
  const rootElement = document.getElementById("root")!;
  if (!rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );
  }
}

void start();
