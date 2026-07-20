"use client";

import { Bell } from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Popover } from "@astryxdesign/core/Popover";
import { Button } from "@astryxdesign/core/Button";
import { List, ListItem } from "@astryxdesign/core/List";
import { dismissAlertAction, snoozeAlertAction } from "../../app/(app)/regularite/actions";
import { ALERT_LABELS, isSnoozable } from "@/core/planner/generateAlerts";
import type { alert as alertTable } from "@/db/schema";

// U26 RegulariteHeader + U31 AlertBell (IMPLEMENT_SCHEDULE.md §7) — chip
// semaine courante, série + gels restants, sessions du jour, cloche avec badge
// du nombre d'alertes visibles + historique 30 j.

type Alert = typeof alertTable.$inferSelect;

function AlertBell({ visible, history }: { visible: Alert[]; history: Alert[] }) {
  const olderHistory = history.filter((h) => !visible.some((v) => v.id === h.id));

  return (
    <Popover
      label="Alertes"
      content={
        <div className="flex max-h-96 w-80 flex-col gap-3 overflow-y-auto">
          <div>
            <p className="text-secondary text-xs">Visibles</p>
            {visible.length === 0 ? (
              <p className="text-secondary text-sm">Rien à signaler.</p>
            ) : (
              <List hasDividers density="compact">
                {visible.map((a) => {
                  const payload = a.payload as { libelle?: string } | null;
                  const snoozable = isSnoozable(a.type);
                  return (
                    <ListItem
                      key={a.id}
                      label={ALERT_LABELS[a.type] ?? a.type}
                      description={payload?.libelle}
                      endContent={
                        <div className="flex gap-1">
                          {snoozable && (
                            <Button
                              size="sm"
                              variant="ghost"
                              label="Reporter"
                              clickAction={async () => {
                                await snoozeAlertAction(a.id);
                              }}
                            />
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            label="Fermer"
                            clickAction={async () => {
                              await dismissAlertAction(a.id);
                            }}
                          />
                        </div>
                      }
                    />
                  );
                })}
              </List>
            )}
          </div>
          {olderHistory.length > 0 && (
            <div>
              <p className="text-secondary text-xs">Historique (30 j)</p>
              <List hasDividers density="compact">
                {olderHistory.map((a) => (
                  <ListItem key={a.id} label={ALERT_LABELS[a.type] ?? a.type} />
                ))}
              </List>
            </div>
          )}
        </div>
      }
    >
      <span className="relative inline-flex">
        <IconButton label="Alertes" icon={<Bell size={18} />} variant="ghost" />
        {visible.length > 0 && (
          <span className="absolute -top-1 -right-1">
            <Badge variant="error" label={String(visible.length)} />
          </span>
        )}
      </span>
    </Popover>
  );
}

export function RegulariteHeader({
  weekLabel,
  streak,
  gelsSerieRestants,
  sessionsToday,
  visibleAlerts,
  alertHistory,
}: {
  weekLabel: string | null;
  streak: number;
  gelsSerieRestants: number;
  sessionsToday: number;
  visibleAlerts: Alert[];
  alertHistory: Alert[];
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {weekLabel && <Badge variant="info" label={weekLabel} />}
        <span className="text-sm">
          Série : <strong>{streak} j</strong> · {gelsSerieRestants} gel(s) restant(s)
        </span>
        <span className="text-secondary text-sm">{sessionsToday} session(s) aujourd&apos;hui</span>
      </div>
      <AlertBell visible={visibleAlerts} history={alertHistory} />
    </div>
  );
}
