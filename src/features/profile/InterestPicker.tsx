import { useEffect, useState } from "react";
import { loadInterests, type Interest } from "./profile-api.ts";
export function InterestPicker({
  selected,
  change,
  disabled,
}: {
  selected: string[];
  change: (names: string[]) => void;
  disabled: boolean;
}) {
  const [choices, setChoices] = useState<Interest[] | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    setChoices(null);
    void loadInterests()
      .then((rows) => {
        if (active) setChoices(rows);
      })
      .catch((error: unknown) => {
        if (active)
          setError(
            error instanceof Error
              ? error.message
              : "Interests could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const unknown = choices
    ? selected.filter(
        (name) =>
          !choices.some(
            (choice) => choice.name.toLowerCase() === name.toLowerCase(),
          ),
      )
    : [];
  const toggle = (name: string) =>
    change(
      selected.some((value) => value.toLowerCase() === name.toLowerCase())
        ? selected.filter((value) => value.toLowerCase() !== name.toLowerCase())
        : [...selected, name],
    );
  return (
    <fieldset className="interest-picker" disabled={disabled}>
      <legend>Interests</legend>
      <p className="small muted">
        Choose up to 12 interests. {selected.length} selected.
      </p>
      {!choices && !error && <p role="status">Loading interests…</p>}
      {error && (
        <div>
          <p role="alert">{error} Your saved interests will be preserved.</p>
          <button
            className="link-btn"
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry interests
          </button>
        </div>
      )}
      {choices?.length === 0 && (
        <p className="small muted">
          No interests are available yet. Your saved choices will be preserved.
        </p>
      )}
      {choices && (
        <div className="interest-options">
          {choices.map((choice) => {
            const checked = selected.some(
              (value) => value.toLowerCase() === choice.name.toLowerCase(),
            );
            return (
              <label
                className={`interest-option ${checked ? "selected" : ""}`}
                key={choice.id}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && selected.length >= 12}
                  onChange={() => toggle(choice.name)}
                />
                {choice.name}
              </label>
            );
          })}
        </div>
      )}
      {unknown.length > 0 && (
        <p className="small muted">
          Previously saved interests: {unknown.join(", ")}. These will be
          preserved.
        </p>
      )}
    </fieldset>
  );
}
