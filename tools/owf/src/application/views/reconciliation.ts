import { actionId, type ActionProjection } from '../../domain/actions/index.js';
import {
  acceptsAction,
  placementColumn,
  evaluateView,
  recordViewOrder,
  insertViewMember,
  type MoveActionInput,
} from '../../domain/views/index.js';
import { WorkspaceError } from '../../domain/workspaces/index.js';
import type {
  ViewPorts,
  ViewWriteSnapshot,
  ViewOrganization,
} from '../ports/index.js';

// Reconcile current routing and arrival order within the writer transaction.
export function reconcilePlacements(
  root: string,
  actionIdValue: string,
  snapshot: ViewWriteSnapshot,
  after: ActionProjection[],
  definitions: ViewPorts['definitions'],
  move?: MoveActionInput,
  selectedOnly = false,
): ViewOrganization {
  const affected = new Set([actionIdValue]);
  const oldState = snapshot.actions.find(
    (action) => action.id === actionIdValue,
  )?.state;
  const newState = after.find((action) => action.id === actionIdValue)?.state;
  if (oldState !== newState)
    for (const action of [...snapshot.actions, ...after])
      if (action.depends_on.some((uri) => actionId(uri) === actionIdValue))
        affected.add(action.id);
  const membershipChanged =
    snapshot.actions.length !== after.length ||
    after.some((action) => {
      const before = snapshot.actions.find(
        (candidate) => candidate.id === action.id,
      );
      return (
        !before ||
        before.state !== action.state ||
        before.blocking.blocked !== action.blocking.blocked
      );
    });
  const placements = [...snapshot.placements];
  let order = [...snapshot.order];
  for (const placement of snapshot.placements)
    if (
      (!selectedOnly || placement.view_id === move?.view) &&
      affected.has(placement.action_id) &&
      !snapshot.views.some((view) => view.id === placement.view_id)
    )
      throw new WorkspaceError(
        'INVALID_VIEW_PLACEMENT',
        `Missing View instance ${placement.view_id}.`,
      );
  for (const view of snapshot.views) {
    if (selectedOnly && view.id !== move?.view) continue;
    // No routing facts changed: references prove an instance unrelated to this write.
    if (
      !membershipChanged &&
      view.id !== move?.view &&
      ![...snapshot.placements, ...snapshot.order].some(
        (row) => row.view_id === view.id && affected.has(row.action_id),
      )
    )
      continue;
    try {
      const definition = definitions.load(root, view.definition);
      const oldPlacements = snapshot.placements.filter(
        (row) => row.view_id === view.id,
      );
      const before = evaluateView(
        definition,
        snapshot.actions,
        oldPlacements,
        snapshot.order.filter((row) => row.view_id === view.id),
      );
      const retained = oldPlacements.filter((placement) => {
        if (!affected.has(placement.action_id)) return true;
        const column = placementColumn(definition, placement);
        const oldAction = snapshot.actions.find(
          (action) => action.id === placement.action_id,
        );
        const newAction = after.find(
          (action) => action.id === placement.action_id,
        );
        return (
          oldAction !== undefined &&
          newAction !== undefined &&
          acceptsAction(column, oldAction) &&
          acceptsAction(column, newAction)
        );
      });
      const selected = move?.view === view.id;
      const source = before.find((column) =>
        column.members.some((member) => member.id === actionIdValue),
      )?.id;
      const crossColumn = selected && source !== move.column;
      if (crossColumn) {
        const index = retained.findIndex(
          (row) => row.action_id === actionIdValue,
        );
        if (index !== -1) retained.splice(index, 1);
        retained.push({
          view_id: view.id,
          action_id: actionIdValue,
          column_id: move.column,
        });
      }
      const continuing = recordViewOrder(view.id, before).filter(
        (row) => !(crossColumn && row.action_id === actionIdValue),
      );
      const final = evaluateView(definition, after, retained, continuing);
      if (selected)
        insertViewMember(final, actionIdValue, move.column, move.position);
      for (let index = placements.length - 1; index >= 0; index--)
        if (placements[index]!.view_id === view.id) placements.splice(index, 1);
      placements.push(...retained);
      order = order
        .filter((row) => row.view_id !== view.id)
        .concat(recordViewOrder(view.id, final));
    } catch (error) {
      throw new WorkspaceError(
        error instanceof WorkspaceError ? error.code : 'VIEW_READ_FAILED',
        `View instance ${view.id}, definition ${view.definition.url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { placements, order };
}
