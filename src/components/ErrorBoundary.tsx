import { Component, type ReactNode } from "react";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="content">
        <h1 className="page-title">We couldn’t open this page</h1>
        <p>
          Please reload and try again. If the problem continues, contact the
          community team.
        </p>
        <button className="btn" onClick={() => location.reload()}>
          Reload page
        </button>
        <p>
          <a href="mailto:whiteperall@gmail.com">whiteperall@gmail.com</a>
        </p>
      </main>
    );
  }
}
