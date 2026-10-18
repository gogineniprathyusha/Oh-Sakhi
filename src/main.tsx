import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./styles/base.css";
import "./styles/community.css";
import "./styles/admin.css";
import "./styles/launch.css";
import "./styles/brand.css";
import { informationPage } from "./lib/information.ts";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
const Information = lazy(() =>
  import("./pages/Information.tsx").then((module) => ({
    default: module.Information,
  })),
);
const App = lazy(() =>
  import("./app/App.tsx").then((module) => ({ default: module.App })),
);
const publicPage = informationPage(location.pathname);

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <ErrorBoundary>
      {publicPage ? (
        <Suspense
          fallback={
            <p className="content" role="status">
              Loading information…
            </p>
          }
        >
          <Information page={publicPage} />
        </Suspense>
      ) : (
        <Suspense
          fallback={
            <p className="content" role="status">
              Loading community…
            </p>
          }
        >
          <App />
        </Suspense>
      )}
    </ErrorBoundary>
  </StrictMode>,
);
