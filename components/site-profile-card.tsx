"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type SiteProfile = {
  business: string;
  audience: string;
  key_conversions: string[];
  starter_questions: string[];
};

export function SiteProfileCard({
  displayName,
  websiteUrl,
  profile,
  onAsk,
}: {
  displayName: string;
  websiteUrl?: string | null;
  profile: SiteProfile | null;
  onAsk: (q: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{displayName}</CardTitle>
          {websiteUrl && (
            <div className="text-xs text-[color:var(--muted-foreground)] truncate mt-1">
              {websiteUrl}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {profile ? (
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                  Business
                </div>
                <div className="leading-snug">{profile.business}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                  Audience
                </div>
                <div className="leading-snug">{profile.audience}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                  Likely key conversions
                </div>
                <div className="flex flex-wrap gap-1">
                  {profile.key_conversions.map((c) => (
                    <span
                      key={c}
                      className="text-xs px-2 py-0.5 rounded-full border border-[color:var(--border)] bg-[color:var(--background)]"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-[color:var(--muted-foreground)]">
              Site profile is still being generated, or could not be auto-detected.
            </div>
          )}
        </CardContent>
      </Card>

      {profile && profile.starter_questions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Try asking</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {profile.starter_questions.map((q) => (
              <Button
                key={q}
                variant="outline"
                className="w-full justify-start text-left whitespace-normal h-auto py-2"
                onClick={() => onAsk(q)}
              >
                {q}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
