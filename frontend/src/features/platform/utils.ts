/** "ORGANIZATION_MEMBERS" -> "Organization Members" */
export function titleCase(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/(^|[_-])\w/g, (match) => match.replace(/[_-]/, " ").toUpperCase());
}
