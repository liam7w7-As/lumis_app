import type { CompanyLicense } from "./api";
export type DocumentEditAccess = "allowed" | "pro" | "read_only" | "checking";
export function documentEditAccess(
  license: CompanyLicense | null,
  connected: boolean,
): DocumentEditAccess {
  if (connected) return "allowed";
  if (!license) return "checking";
  if (license.readOnly) return "read_only";
  return license.features.editDocuments ? "allowed" : "pro";
}
