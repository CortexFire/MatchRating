"use client";

import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReviewPanel() {
  const [message, setMessage] = useState("Confirmation is optional for ratings, but it keeps the score trusted.");

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button type="button" onClick={() => setMessage("Confirmed. The match is now marked trusted.")}>
        <Check className="size-4" />
        Confirm
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setMessage("Disputed. Revise the score and resubmit for the other team.")}
      >
        <AlertTriangle className="size-4" />
        Dispute
      </Button>
      <p className="col-span-2 rounded-lg border border-stroke bg-surface p-3 text-sm font-semibold text-muted">
        {message}
      </p>
    </div>
  );
}
