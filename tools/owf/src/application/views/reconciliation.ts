import { actionId, type ActionProjection } from '../../domain/actions/index.js';
import {
  acceptsAction,
  placementColumn,
  type ViewPlacement,
} from '../../domain/views/index.js';
import { WorkspaceError } from '../../domain/workspaces/index.js';
import type { ViewPorts, ViewWriteSnapshot } from '../ports/index.js';

// Load only definitions needed by affected stored placements, inside the writer's transaction.
export function reconcilePlacements(
  root: string,
  actionIdValue: string,
  snapshot: ViewWriteSnapshot,
  after: ActionProjection[],
  definitions: ViewPorts['definitions'],
): ViewPlacement[] {
  const affected = new Set([actionIdValue]);
  const oldState = snapshot.actions.find(
    (action) => action.id === actionIdValue,
  )?.state;
  const newState = after.find((action) => action.id === actionIdValue)?.state;
  if (oldState !== newState)
    for (const action of [...snapshot.actions, ...after])
      if (action.depends_on.some((uri) => actionId(uri) === actionIdValue))
        affected.add(action.id);
  const loaded = new Map<
    string,
    ReturnType<ViewPorts['definitions']['load']>
  >();
  return snapshot.placements.filter((placement) => {
    if (!affected.has(placement.action_id)) return true;
    const view = snapshot.views.find((view) => view.id === placement.view_id);
    if (!view)
      throw new WorkspaceError(
        'INVALID_VIEW_PLACEMENT',
        `Missing View instance ${placement.view_id}.`,
      );
    try {
      let definition = loaded.get(view.id);
      if (!definition) {
        definition = definitions.load(root, view.definition);
        loaded.set(view.id, definition);
      }
      const column = placementColumn(definition, placement);
      const beforeAction = snapshot.actions.find(
        (action) => action.id === placement.action_id,
      );
      const afterAction = after.find(
        (action) => action.id === placement.action_id,
      );
      // Check both snapshots: a proposed change must never revive pre-change residue.
      return (
        beforeAction !== undefined &&
        afterAction !== undefined &&
        acceptsAction(column, beforeAction) &&
        acceptsAction(column, afterAction)
      );
    } catch (error) {
      throw new WorkspaceError(
        error instanceof WorkspaceError ? error.code : 'VIEW_READ_FAILED',
        `View instance ${view.id}, definition ${view.definition.url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
}
