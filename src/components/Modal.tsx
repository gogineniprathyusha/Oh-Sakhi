import { useEffect, useRef, type ReactNode } from "react";
interface Props {
  title: string;
  children: ReactNode;
  close: () => void;
  opener?: HTMLElement | null;
}
export function Modal({ title, children, close, opener }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const elements = [
        ...(dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,select,textarea,a[href]",
        ) ?? []),
      ];
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      document.body.style.overflow = overflow;
      requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus({ preventScroll: true });
        else
          document
            .querySelector<HTMLButtonElement>("#header-create")
            ?.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialog}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-head">
          <h2 id="modal-title">{title}</h2>
          <button
            className="icon-btn"
            onClick={close}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>
        <div id="modal-body">{children}</div>
      </div>
    </div>
  );
}
