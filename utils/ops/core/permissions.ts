import type { Actor, Role } from "../../../src/ops/contracts/core";

const permissions: Record<Role, ReadonlySet<string>> = {
  owner: new Set(["session.read", "workspace.bootstrap", "workspace.list"]),
  manager: new Set(["session.read"]),
  lister: new Set(["session.read"]),
  warehouse: new Set(["session.read"]),
};

export function can(actor: Actor, operation: string) {
  return permissions[actor.role].has(operation);
}
