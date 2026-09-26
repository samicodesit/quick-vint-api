import type { Actor, Role } from "../../../src/ops/contracts/core";

const permissions: Record<Role, ReadonlySet<string>> = {
  owner: new Set([
    "session.read",
    "workspace.bootstrap",
    "workspace.list",
    "item.create",
    "identifier.add",
    "lot.create",
    "lot.allocate",
    "item.cost.correct",
    "inventory.list",
    "item.detail",
    "lot.detail",
  ]),
  manager: new Set([
    "session.read",
    "item.create",
    "identifier.add",
    "lot.create",
    "lot.allocate",
    "item.cost.correct",
    "inventory.list",
    "item.detail",
    "lot.detail",
  ]),
  lister: new Set([
    "session.read",
    "item.create",
    "identifier.add",
    "lot.create",
    "inventory.list",
    "item.detail",
    "lot.detail",
  ]),
  warehouse: new Set([
    "session.read",
    "inventory.list",
    "item.detail",
    "lot.detail",
  ]),
};

export function can(actor: Actor, operation: string) {
  return permissions[actor.role].has(operation);
}
