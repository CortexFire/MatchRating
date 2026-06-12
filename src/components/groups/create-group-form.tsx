"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreateGroupForm() {
  const [created, setCreated] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setCreated(true);
      }}
    >
      <label className="flex flex-col gap-2 text-sm font-semibold text-ink">
        Group name
        <Input defaultValue="Wednesday Club Ladder" required />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold text-ink">
        Description
        <Input defaultValue="Friendly competitive badminton ladder." />
      </label>
      <div className="rounded-lg border border-dashed border-stroke bg-surface p-3 text-sm text-muted">
        Recently played members can be invited after the group is created. Invite email sending is intentionally out of MVP.
      </div>
      <Button type="submit">
        <Plus className="size-4" />
        Create group
      </Button>
      {created ? (
        <p className="rounded-lg border border-victory-stroke bg-victory p-3 text-sm font-semibold text-ink">
          Demo group created. In production this calls the Supabase server action.
        </p>
      ) : null}
    </form>
  );
}
