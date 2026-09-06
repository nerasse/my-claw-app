/**
 * The frames an approval travels on. `approval.request` queues a sheet (deduped by id, so the
 * live turn journal replaying it does not ask twice), `approval.pending` replaces the whole queue
 * at connect, `approval.resolved` drops one wherever it sits.
 *
 * The pending list is the one that was missing: a sheet is broadcast once, and the server only
 * replayed it to a sync of the thread it belonged to. A window opening on another conversation,
 * or an app back from sleep, never saw it, and the tool was denied on timeout without the owner
 * being asked anything.
 */

import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import type { ApprovalRequestFrame } from '../protocol';

function makeHandlers() {
  const state = { approvals: [] as ApprovalRequestFrame[] };
  const serverHandlers = {
    setApprovals: (update: (current: ApprovalRequestFrame[]) => ApprovalRequestFrame[]) => {
      state.approvals = update(state.approvals);
    },
  } as unknown as ServerFrameHandlers;
  return { state, serverHandlers };
}

const request = (id: string, threadId = 't1'): ApprovalRequestFrame => ({
  type: 'approval.request',
  id,
  threadId,
  toolName: 'bash',
  args: { command: 'ls' },
  expiresAt: 1,
  allowSessionOffered: false,
});

describe('frameRouter approval frames', () => {
  it('queues a request and drops it on resolved', () => {
    const { state, serverHandlers } = makeHandlers();
    routeServerFrame(request('a1'), serverHandlers);
    expect(state.approvals.map(a => a.id)).toEqual(['a1']);

    routeServerFrame({ type: 'approval.resolved', id: 'a1', threadId: 't1', reason: 'expired' }, serverHandlers);
    expect(state.approvals).toEqual([]);
  });

  it('the pending list at connect is what the client ends up holding', () => {
    const { state, serverHandlers } = makeHandlers();
    routeServerFrame(request('stale', 't9'), serverHandlers);

    routeServerFrame(
      {
        type: 'approval.pending',
        entries: [
          { id: 'a7', threadId: 't2', toolName: 'write', args: { path: 'notes.md' }, expiresAt: 2, allowSessionOffered: true },
        ],
      },
      serverHandlers,
    );

    // Not merged: the server's list is the truth, so a sheet the client kept from a dead run goes.
    expect(state.approvals.map(a => a.id)).toEqual(['a7']);
    expect(state.approvals[0]).toMatchObject({ type: 'approval.request', toolName: 'write', threadId: 't2' });
  });

  it('an empty pending list clears a sheet left behind by a restart', () => {
    const { state, serverHandlers } = makeHandlers();
    routeServerFrame(request('a1'), serverHandlers);

    routeServerFrame({ type: 'approval.pending', entries: [] }, serverHandlers);

    expect(state.approvals).toEqual([]);
  });
});
