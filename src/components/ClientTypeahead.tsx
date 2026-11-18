"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type ClientOption = {
  id: string;
  name: string;
  path: string;
  softwareId: string | null;
  hardwareId: string | null;
};

type Props = {
  clientsRoot: string;
  value: ClientOption | null;
  onSelect: (client: ClientOption) => void;
  onCreate: (name: string) => Promise<ClientOption>;
};

export function ClientTypeahead({
  clientsRoot,
  value,
  onSelect,
  onCreate,
}: Props) {
  const listId = useId();
  const [query, setQuery] = useState(value?.name ?? "");
  const [options, setOptions] = useState<ClientOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/clients?q=${encodeURIComponent(query.trim())}`,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load clients");
        if (!cancelled) setOptions(data.clients || []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setOptions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const exactMatch = useMemo(
    () =>
      options.some(
        (o) => o.name.toLowerCase() === query.trim().toLowerCase(),
      ),
    [options, query],
  );

  const items = useMemo(() => {
    const list: Array<
      | { kind: "client"; client: ClientOption }
      | { kind: "create"; name: string }
    > = options.map((client) => ({ kind: "client" as const, client }));
    if (query.trim() && !exactMatch) {
      list.unshift({ kind: "create", name: query.trim() });
    }
    return list;
  }, [options, query, exactMatch]);

  useEffect(() => {
    setActive(0);
  }, [items.length, query]);

  async function choose(index: number) {
    const item = items[index];
    if (!item) return;
    if (item.kind === "client") {
      onSelect(item.client);
      setQuery(item.client.name);
      setOpen(false);
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await onCreate(item.name);
      onSelect(created);
      setQuery(created.name);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      void choose(active);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const previewName = value?.name || query.trim() || "ClientName";

  return (
    <div className="typeahead" ref={wrapRef}>
      <label className="label" htmlFor="client-search">
        Client
        <input
          id="client-search"
          className="field"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          placeholder="Search or create a client…"
          value={query}
          disabled={creating}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </label>

      {open && (
        <div
          className="typeahead-list"
          role="listbox"
          id={listId}
          aria-label="Clients"
        >
          {loading && <div className="typeahead-option empty">Searching…</div>}
          {!loading && items.length === 0 && (
            <div className="typeahead-option empty">No clients found</div>
          )}
          {items.map((item, index) =>
            item.kind === "create" ? (
              <button
                key="create"
                type="button"
                id={`${listId}-${index}`}
                role="option"
                aria-selected={active === index}
                className="typeahead-option create"
                data-active={active === index ? "true" : "false"}
                onMouseEnter={() => setActive(index)}
                onClick={() => void choose(index)}
              >
                Create new client “{item.name}”
              </button>
            ) : (
              <button
                key={item.client.id}
                type="button"
                id={`${listId}-${index}`}
                role="option"
                aria-selected={active === index}
                className="typeahead-option"
                data-active={active === index ? "true" : "false"}
                onMouseEnter={() => setActive(index)}
                onClick={() => void choose(index)}
              >
                {item.client.name}
                <div className="muted">{item.client.path}</div>
              </button>
            ),
          )}
        </div>
      )}

      <div className="path-preview" aria-live="polite">
        {clientsRoot} / {previewName} / Software · Hardware
      </div>
      {error && <div className="banner banner-error" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  );
}
