import { describe, expect, test, vi } from "vitest";
import { listVisibleGroupMemberships } from "./group-membership-visibility";

const GROUP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("listVisibleGroupMemberships", () => {
  test("uses the service-only SQL visibility projection without table traversal", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        group_id: GROUP_ID,
        user_id: USER_ID,
        role: "member",
        display_name: "Guest Player",
        is_guest: true,
        active_until: null,
      }],
      error: null,
    });
    const service = {
      rpc,
      from: vi.fn(() => {
        throw new Error("visibility must be resolved by SQL");
      }),
    } as never;

    await expect(listVisibleGroupMemberships([GROUP_ID, GROUP_ID], service)).resolves.toEqual([{
      groupId: GROUP_ID,
      userId: USER_ID,
      role: "member",
      profile: {
        id: USER_ID,
        displayName: "Guest Player",
        isGuest: true,
        activeUntil: null,
      },
    }]);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("list_visible_group_memberships_v2", { p_group_ids: [GROUP_ID] });
  });

  test("does not call the database for an empty group set", async () => {
    const rpc = vi.fn();

    await expect(listVisibleGroupMemberships([], { rpc } as never)).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
