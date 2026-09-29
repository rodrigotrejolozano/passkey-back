export type SupportedLocale = "es" | "en";

export function supportedLocale(value: unknown): SupportedLocale {
  return value === "en" ? "en" : "es";
}
