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
  clients: ClientOption[];
  value: ClientOption | null;
  disabled?: boolean;
  onSelect: (client: ClientOption) => void;
  onCreate: (name: string) => void;
};

type Item =
  | { kind: "client"; client: ClientOption }
  | { kind: "create"; name: string };

const MIN_QUERY = 2;

export function ClientTypeahead({ clients, value, disabled, onSelect, onCreate }: Props) {
  const listId = useId();
  const [query, setQuery] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const term = query.trim();
  const canSearch = term.length >= MIN_QUERY;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const matches = useMemo(() => {
    if (!canSearch) return [];
    const q = term.toLowerCase();
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, term, canSearch]);

  const exactMatch = matches.some((c) => c.name.toLowerCase() === term.toLowerCase());

  const items = useMemo<Item[]>(() => {
    if (!canSearch) return [];
    const list: Item[] = matches.map((client) => ({ kind: "client", client }));
    if (!exactMatch) list.push({ kind: "create", name: term });
    return list;
  }, [canSearch, matches, exactMatch, term]);

  useEffect(() => {
    setActive(0);
  }, [items.length, term]);

  function choose(index: number) {
    const item = items[index];
    if (!item || disabled) return;
    setOpen(false);
    if (item.kind === "client") {
      setQuery(item.client.name);
      onSelect(item.client);
    } else {
      onCreate(item.name);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (open) choose(active);
      else setOpen(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && !disabled && items.length > 0;

  return (
    <div className="typeahead" ref={wrapRef}>
      <label className="label" htmlFor="client-search">
        Client
        <input
          id="client-search"
          className="field"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          placeholder="Type a client name to search…"
          autoComplete="off"
          autoFocus
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (canSearch) setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
      </label>

      {!canSearch && (
        <div className="muted hint-line">
          Type at least {MIN_QUERY} characters to search {clients.length} client
          {clients.length === 1 ? "" : "s"}.
        </div>
      )}

      {showList && (
        <div className="typeahead-list" role="listbox" id={listId} aria-label="Clients">
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
                onClick={() => choose(index)}
              >
                {matches.length === 0
                  ? `No client named “${item.name}”. Create new client`
                  : `Create new client “${item.name}”`}
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
                onClick={() => choose(index)}
              >
                {item.client.name}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
