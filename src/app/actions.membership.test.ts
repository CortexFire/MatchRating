import { beforeEach, describe, expect, test, vi } from "vitest";
import { leaveGroup } from "@/app/actions";

const supabaseMocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return {
    createSupabaseServerClient: vi.fn(async () => ({ rpc })),
    createSupabaseServiceClient: vi.fn(() => ({
      from: () => {
        throw new Error("leaveGroup must use the membership command instead of a table mutation");
      },
    })),
    requireUserId: vi.fn(async () => "user-0000-0000-0000-000000000000"),
    rpc,
  };
});

const cacheMocks = vi.hoisted(() => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/supabase/server", () => supabaseMocks);
vi.mock("next/cache", () => cacheMocks);

describe("leaveGroup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.rpc.mockResolvedValue({
      data: { groupId: "11111111-1111-4111-8111-111111111111" },
      error: null,
    });
  });

  test("leaves through the idempotent membership command and revalidates the group", async () => {
    const groupId = "11111111-1111-4111-8111-111111111111";

    const result = await leaveGroup(groupId, { commandId: "22222222-2222-4222-8222-222222222222" });

    expect(result).toEqual({ ok: true, data: { groupId } });
    expect(supabaseMocks.rpc).toHaveBeenCalledWith("command_leave_group", {
      p_command_id: "22222222-2222-4222-8222-222222222222",
      p_group_id: groupId,
    });
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(`/groups/${groupId}`);
  });
});
