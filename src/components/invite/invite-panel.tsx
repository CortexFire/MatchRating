"use client";

import { useMemo, useState } from "react";
import { Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function InvitePanel({ inviteUrl }: { inviteUrl: string }) {
  const [copied, setCopied] = useState(false);
  const displayInviteUrl = inviteUrl.replace(/^https?:\/\//, "").replace("/join/", "/j/");
  const shareText = useMemo(() => `Join my badminton rankings group: ${inviteUrl}`, [inviteUrl]);

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col items-center gap-6 p-5">
        <h2 className="text-center text-2xl font-bold leading-8 text-ink">Scan to join</h2>
        <div className="rounded-lg border border-stroke bg-white p-4">
          <QRCodeSVG value={inviteUrl} size={208} bgColor="#ffffff" fgColor="var(--ink)" />
        </div>
        <div className="flex h-14 w-full items-center gap-2 rounded-lg border border-stroke bg-surface px-3">
          <Input
            readOnly
            value={displayInviteUrl}
            aria-label="Invite URL"
            title={inviteUrl}
            className="h-auto min-w-0 flex-1 border-0 bg-transparent px-0 text-xs shadow-none focus:border-transparent focus:ring-0"
          />
          <Button
            variant="ghost"
            type="button"
            className="min-h-9 min-w-16 rounded-full bg-victory px-3 text-xs hover:bg-selection"
            onClick={async () => {
              await navigator.clipboard.writeText(inviteUrl);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <Button
          type="button"
          className="min-h-14 w-full text-base"
          onClick={async () => {
            if (navigator.share) {
              await navigator.share({ text: shareText, url: inviteUrl });
            }
          }}
        >
          <Share2 className="size-5" />
          Share invite
        </Button>
      </CardContent>
    </Card>
  );
}
