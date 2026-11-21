export type FormState = {
  error?: string;
  message?: string;
  /** Submitted values (minus passwords) so inputs keep them after React resets the form. */
  values?: Record<string, string>;
};

const SECRET_FIELDS = new Set(["password", "confirm"]);

export function failure(formData: FormData, error: string): FormState {
  const values: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string" && !SECRET_FIELDS.has(key) && !key.startsWith("$")) {
      values[key] = value;
    }
  });
  return { error, values };
}
