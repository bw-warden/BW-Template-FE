"use client";

import {
  ACCESS_LEVEL_OPTIONS,
  type CollectionAccessGrant,
  type CollectionAccessLevel,
} from "@/lib/collection-access";

export type GroupOption = {
  id: string;
  name: string;
};

type Props = {
  title: string;
  grants: CollectionAccessGrant[];
  groups: GroupOption[];
  disabled?: boolean;
  onChange: (next: CollectionAccessGrant[]) => void;
};

export function CollectionAccessEditor({
  title,
  grants,
  groups,
  disabled = false,
  onChange,
}: Props) {
  const used = new Set(grants.map((g) => g.groupId));
  const available = groups.filter((g) => !used.has(g.id));

  function groupName(id: string) {
    return groups.find((g) => g.id === id)?.name || id;
  }

  function setAccess(groupId: string, access: CollectionAccessLevel) {
    onChange(
      grants.map((g) => (g.groupId === groupId ? { ...g, access } : g)),
    );
  }

  function remove(groupId: string) {
    onChange(grants.filter((g) => g.groupId !== groupId));
  }

  function add(groupId: string) {
    if (!groupId || used.has(groupId)) return;
    // Bitwarden admin UI defaults new Shared Folder assignments to Can edit.
    onChange([...grants, { groupId, access: "edit" }]);
  }

  return (
    <div className="access-editor">
      <div className="access-editor-head">
        <h3 className="access-editor-title">{title}</h3>
      </div>

      {grants.length === 0 ? (
        <p className="muted access-empty">No groups assigned.</p>
      ) : (
        <ul className="access-rows">
          {grants.map((g) => (
            <li key={g.groupId} className="access-row">
              <span className="access-group-name">{groupName(g.groupId)}</span>
              <select
                className="field field-compact"
                value={g.access}
                disabled={disabled}
                onChange={(e) =>
                  setAccess(
                    g.groupId,
                    e.target.value as CollectionAccessLevel,
                  )
                }
                aria-label={`Access for ${groupName(g.groupId)}`}
              >
                {ACCESS_LEVEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                disabled={disabled}
                onClick={() => remove(g.groupId)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="access-add">
        <select
          className="field"
          disabled={disabled || available.length === 0}
          value=""
          onChange={(e) => {
            add(e.target.value);
            e.target.value = "";
          }}
          aria-label={`Add group to ${title}`}
        >
          <option value="">
            {available.length === 0
              ? groups.length === 0
                ? "Refresh groups to assign access"
                : "All groups already assigned"
              : "Add group…"}
          </option>
          {available.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
