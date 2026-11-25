/** Client-safe audit action labels (no Redis / Node imports). */

export const AUDIT_ACTIONS = [
  "auth.login",
  "auth.logout",
  "auth.setup",
  "client.create",
  "access.update",
  "item.provision",
  "template.create",
  "template.update",
  "template.delete",
  "user.create",
  "user.update",
  "user.delete",
  "settings.update",
  "branding.upload",
  "branding.delete",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export function auditActionLabel(action: string): string {
  const map: Record<string, string> = {
    "auth.login": "Login",
    "auth.logout": "Logout",
    "auth.setup": "Setup",
    "client.create": "Client create",
    "access.update": "Access change",
    "item.provision": "Provision",
    "template.create": "Template create",
    "template.update": "Template update",
    "template.delete": "Template delete",
    "user.create": "User create",
    "user.update": "User update",
    "user.delete": "User delete",
    "settings.update": "Settings",
    "branding.upload": "Branding upload",
    "branding.delete": "Branding delete",
  };
  return map[action] || action;
}
