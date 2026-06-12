import { UsersRound } from "lucide-react";
import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateGroupForm } from "@/components/groups/create-group-form";
import { demoPlayers } from "@/lib/demo-data";

export default function NewGroupPage() {
  return (
    <MobileShell active="Home">
      <ScreenHeader title="Create group" subtitle="Ratings, history, and rankings stay independent per group." backHref="/groups/demo" />
      <Card>
        <CardHeader>
          <CardTitle>Group details</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateGroupForm />
        </CardContent>
      </Card>
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <UsersRound className="size-4" />
          Recently played
        </div>
        <div className="grid grid-cols-2 gap-2">
          {demoPlayers.slice(0, 4).map((player) => (
            <div key={player.id} className="rounded-lg border border-stroke bg-surface p-3">
              <p className="text-sm font-semibold">{player.name}</p>
              <p className="text-xs text-muted">Rating {player.rating}</p>
            </div>
          ))}
        </div>
      </section>
    </MobileShell>
  );
}
