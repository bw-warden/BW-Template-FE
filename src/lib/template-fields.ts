/**
 * Bitwarden custom fields have no required flag. Templates store the list of
 * required field names in a hidden field that this app never shows or copies
 * onto items created from the template.
 */
export const REQUIRED_FIELD_NAME = "__templateRequired";

export type TemplateFieldInput = {
  name: string;
  value?: string;
  type?: number;
  required?: boolean;
};

export type StoredVaultField = {
  name: string;
  value: string;
  type: number;
};

export class RequiredFieldsError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(
      missing.length === 1
        ? `${missing[0]} is required`
        : `These fields are required: ${missing.join(", ")}`,
    );
    this.name = "RequiredFieldsError";
    this.missing = missing;
  }
}

export function encodeTemplateFields(fields: TemplateFieldInput[]): StoredVaultField[] {
  const visible = fields
    .filter((field) => {
      const name = field.name.trim();
      return name.length > 0 && name !== REQUIRED_FIELD_NAME;
    })
    .map((field) => ({
      name: field.name.trim(),
      value: field.value ?? "",
      type: field.type ?? 0,
      required: Boolean(field.required),
    }));

  const requiredNames = [
    ...new Set(visible.filter((field) => field.required).map((field) => field.name)),
  ];

  const stored: StoredVaultField[] = visible.map(({ name, value, type }) => ({
    name,
    value,
    type,
  }));

  if (requiredNames.length > 0) {
    stored.push({
      name: REQUIRED_FIELD_NAME,
      value: JSON.stringify(requiredNames),
      type: 1,
    });
  }

  return stored;
}

export function decodeTemplateFields(fields: TemplateFieldInput[] | undefined): {
  fields: StoredVaultField[];
  requiredNames: Set<string>;
} {
  const all = fields ?? [];
  const meta = all.find((field) => field.name === REQUIRED_FIELD_NAME);
  const requiredNames = new Set<string>();

  if (meta?.value) {
    try {
      const parsed = JSON.parse(meta.value) as unknown;
      if (Array.isArray(parsed)) {
        for (const name of parsed) {
          if (typeof name === "string" && name.trim()) requiredNames.add(name);
        }
      }
    } catch {
      // A damaged marker means no fields are required, rather than a broken template.
    }
  }

  const visible = all
    .filter((field) => field.name !== REQUIRED_FIELD_NAME)
    .map((field) => ({
      name: field.name,
      value: field.value ?? "",
      type: field.type ?? 0,
    }));

  const present = new Set(
    [...requiredNames].filter((name) => visible.some((field) => field.name === name)),
  );

  return { fields: visible, requiredNames: present };
}

export function stripTemplateMeta<T extends { name: string }>(fields: T[] | undefined): T[] {
  return (fields ?? []).filter((field) => field.name !== REQUIRED_FIELD_NAME);
}

/** Text and hidden fields must be non-blank. A boolean field must be true or false. */
export function fieldValueSatisfies(type: number, value: string): boolean {
  if (type === 2) return value === "true" || value === "false";
  return value.trim().length > 0;
}

export function missingRequiredFields(
  templateFields: TemplateFieldInput[] | undefined,
  submitted: TemplateFieldInput[] | undefined,
): string[] {
  const { fields, requiredNames } = decodeTemplateFields(templateFields);
  const incoming = (submitted ?? []).filter((field) => {
    const name = field.name.trim();
    return name.length > 0 && name !== REQUIRED_FIELD_NAME;
  });

  const missing: string[] = [];
  for (const spec of fields) {
    if (!requiredNames.has(spec.name)) continue;
    const got = incoming.find((field) => field.name === spec.name);
    if (!fieldValueSatisfies(spec.type, got?.value ?? "")) missing.push(spec.name);
  }
  return missing;
}
