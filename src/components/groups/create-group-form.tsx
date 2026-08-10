"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createGroup } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function redirectTo(url: string) {
  window.location.assign(url);
}

export function CreateGroupForm({ onRedirect = redirectTo }: { onRedirect?: (url: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isNameFocused, setIsNameFocused] = useState(false);
  const [isDescriptionFocused, setIsDescriptionFocused] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createGroup({ name, description });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }

      onRedirect(`/groups/${result.data.groupId}`);
    });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <label className="flex flex-col gap-2 text-sm font-semibold text-ink">
        Group name
        <Input
          placeholder={isNameFocused || name ? undefined : "Club Name"}
          value={name}
          onFocus={() => setIsNameFocused(true)}
          onBlur={() => setIsNameFocused(false)}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold text-ink">
        Description
        <Input
          placeholder={isDescriptionFocused || description ? undefined : "Club description"}
          value={description}
          onFocus={() => setIsDescriptionFocused(true)}
          onBlur={() => setIsDescriptionFocused(false)}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <Button type="submit" disabled={isPending || !name.trim()}>
        <Plus className="size-4" />
        {isPending ? "Creating" : "Create group"}
      </Button>
      {message ? <p className="rounded-lg border border-stroke bg-surface p-3 text-sm text-muted">{message}</p> : null}
    </form>
  );
}
