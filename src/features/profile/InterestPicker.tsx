import { useEffect, useState } from "react";
import { loadInterests, type Interest } from "./profile-api.ts";
import { interestError, normalizeInterests } from "./interests.ts";

function InterestChoices({
  choices,
  selected,
  change,
}: {
  choices: Interest[];
  selected: string[];
  change: (names: string[]) => void;
}) {
  const catalog = choices.map((choice) => choice.name);
  const isCatalog = (name: string) =>
    catalog.some((value) => value.toLowerCase() === name.toLowerCase());
  const [presets, setPresets] = useState(() => selected.filter(isCatalog));
  const [custom, setCustom] = useState(() =>
    selected.filter((name) => !isCatalog(name)).join(", "),
  );
  const error = interestError(selected, catalog);
  function updateCustom(value: string) {
    setCustom(value);
    change(normalizeInterests([...presets, ...value.split(",")], catalog));
  }
  function toggle(name: string) {
    const checked = selected.some(
      (value) => value.toLowerCase() === name.toLowerCase(),
    );
    if (checked) {
      setPresets(
        presets.filter((value) => value.toLowerCase() !== name.toLowerCase()),
      );
      setCustom(
        custom
          .split(",")
          .filter((value) => value.trim().toLowerCase() !== name.toLowerCase())
          .join(","),
      );
      change(
        selected.filter((value) => value.toLowerCase() !== name.toLowerCase()),
      );
    } else {
      setPresets([...presets, name]);
      change(normalizeInterests([...selected, name], catalog));
    }
  }
  return (
    <>
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
      <div className="field custom-interests">
        <label htmlFor="profile-other-interests">Other interests</label>
        <p id="profile-interest-help" className="small muted">
          Can’t find yours? Add interests separated by commas, up to 60
          characters each. They count toward the same 12-interest limit.
        </p>
        <input
          id="profile-other-interests"
          value={custom}
          onChange={(event) => updateCustom(event.target.value)}
          maxLength={1500}
          placeholder="e.g. Gardening, Photography"
          aria-describedby={`profile-interest-help${error ? " profile-interest-error" : ""}`}
          aria-invalid={Boolean(error)}
        />
        {error && (
          <p id="profile-interest-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
export function InterestPicker({
  selected,
  change,
  disabled,
  catalogLoaded,
}: {
  selected: string[];
  change: (names: string[]) => void;
  disabled: boolean;
  catalogLoaded: (names: string[]) => void;
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
        if (active) {
          setChoices(rows);
          catalogLoaded(rows.map((row) => row.name));
        }
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
  }, [attempt, catalogLoaded]);
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
        <InterestChoices
          choices={choices}
          selected={selected}
          change={change}
        />
      )}
    </fieldset>
  );
}
