import type {
  EconomyCrime,
  EconomyIncomeConfig,
  EconomyJob,
  EconomyRoleSalary,
  GuildRoleAsset,
} from "@adobos/shared";
import {
  defaultEconomyCrime,
  defaultEconomyIncomeConfig,
  defaultEconomyJob,
  defaultEconomyRob,
} from "@adobos/shared";
import {
  fetchEconomyConfig,
  fetchEconomyIncomeConfig,
  fetchGuildAssets,
  saveEconomyIncomeConfig,
} from "@/lib/api";
import { RoleColorDot } from "@/components/shared/RoleColorDot";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToastBanner } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  Briefcase,
  Loader2,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EconomyJobsDiscordPreview,
  type EconomyJobsSimulatorTab,
} from "./EconomyJobsDiscordPreview";

type TabId = EconomyJobsSimulatorTab;

function newLocalId(): string {
  return crypto.randomUUID();
}

function configFingerprint(config: EconomyIncomeConfig): string {
  return JSON.stringify({
    dailyPay: config.dailyPay,
    weeklyPay: config.weeklyPay,
    monthlyPay: config.monthlyPay,
    streakEnabled: config.streakEnabled,
    streakBonusPercent: config.streakBonusPercent,
    roleSalaries: config.roleSalaries,
    jobs: config.jobs,
    crimes: config.crimes,
    rob: config.rob,
  });
}

function roleDotColor(
  role: GuildRoleAsset | undefined,
): string | number | null {
  if (!role) return null;
  return role.hexColor ?? role.color ?? null;
}

export function EconomyJobsDashboard() {
  const [tab, setTab] = useState<TabId>("fixed");
  const [config, setConfig] = useState<EconomyIncomeConfig>(() =>
    defaultEconomyIncomeConfig(),
  );
  const [savedFingerprint, setSavedFingerprint] = useState(() =>
    configFingerprint(defaultEconomyIncomeConfig()),
  );
  const [currencyName, setCurrencyName] = useState("Adobos Coins");
  const [currencySymbol, setCurrencySymbol] = useState("🪙");
  const [roles, setRoles] = useState<GuildRoleAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    variant: "success" | "error";
    message: string;
  } | null>(null);

  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [openCrimeId, setOpenCrimeId] = useState<string | null>(null);
  const [crimeOutcome, setCrimeOutcome] = useState<"success" | "fail">(
    "success",
  );

  const dirty = useMemo(
    () => configFingerprint(config) !== savedFingerprint,
    [config, savedFingerprint],
  );

  const assignableRoles = useMemo(
    () =>
      roles
        .filter(
          (r) =>
            r.name !== "@everyone" &&
            (!r.managed || r.premiumSubscriber),
        )
        .sort((a, b) => b.position - a.position),
    [roles],
  );

  const activeJob = useMemo(() => {
    if (openJobId) {
      return config.jobs.find((j) => j.id === openJobId) ?? null;
    }
    return config.jobs[0] ?? null;
  }, [config.jobs, openJobId]);

  const activeCrime = useMemo(() => {
    if (openCrimeId) {
      return config.crimes.find((c) => c.id === openCrimeId) ?? null;
    }
    return config.crimes[0] ?? null;
  }, [config.crimes, openCrimeId]);

  const load = useCallback(async () => {
    setLoading(true);
    setToast(null);
    try {
      const [income, economy, assets] = await Promise.all([
        fetchEconomyIncomeConfig(),
        fetchEconomyConfig().catch(() => null),
        fetchGuildAssets().catch(() => null),
      ]);
      setConfig({
        ...income,
        rob: income.rob ?? defaultEconomyRob(),
      });
      setSavedFingerprint(
        configFingerprint({
          ...income,
          rob: income.rob ?? defaultEconomyRob(),
        }),
      );
      if (economy) {
        setCurrencyName(economy.currencyName);
        setCurrencySymbol(economy.currencySymbol);
      }
      if (assets?.roles) setRoles(assets.roles);

      // Colapsar por defecto si hay más de 3 ítems.
      setOpenJobId(income.jobs.length > 3 ? null : (income.jobs[0]?.id ?? null));
      setOpenCrimeId(
        income.crimes.length > 3 ? null : (income.crimes[0]?.id ?? null),
      );
    } catch (error) {
      setToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Couldn't load income and jobs.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setToast(null);
    try {
      const next = await saveEconomyIncomeConfig({
        dailyPay: config.dailyPay,
        weeklyPay: config.weeklyPay,
        monthlyPay: config.monthlyPay,
        streakEnabled: config.streakEnabled,
        streakBonusPercent: config.streakBonusPercent,
        roleSalaries: config.roleSalaries,
        jobs: config.jobs,
        crimes: config.crimes,
        rob: config.rob,
      });
      setConfig(next);
      setSavedFingerprint(configFingerprint(next));
      setToast({
        variant: "success",
        message: "Income configuration saved.",
      });
    } catch (error) {
      setToast({
        variant: "error",
        message:
          error instanceof Error ? error.message : "Couldn't save.",
      });
    } finally {
      setSaving(false);
    }
  }

  function updateSalary(
    index: number,
    patch: Partial<EconomyRoleSalary>,
  ): void {
    setConfig((c) => ({
      ...c,
      roleSalaries: c.roleSalaries.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    }));
  }

  function addSalary(): void {
    const first = assignableRoles[0];
    setConfig((c) => ({
      ...c,
      roleSalaries: [
        ...c.roleSalaries,
        {
          id: newLocalId(),
          roleId: first?.id ?? "",
          amount: 100,
          frequency: "daily",
        },
      ],
    }));
  }

  function removeSalary(index: number): void {
    setConfig((c) => ({
      ...c,
      roleSalaries: c.roleSalaries.filter((_, i) => i !== index),
    }));
  }

  function updateJob(id: string, patch: Partial<EconomyJob>): void {
    setConfig((c) => ({
      ...c,
      jobs: c.jobs.map((job) => (job.id === id ? { ...job, ...patch } : job)),
    }));
  }

  function addJob(): void {
    const job = defaultEconomyJob({ id: newLocalId(), name: "New job" });
    setConfig((c) => ({ ...c, jobs: [...c.jobs, job] }));
    setOpenJobId(job.id);
    setTab("jobs");
  }

  function removeJob(id: string): void {
    setConfig((c) => ({ ...c, jobs: c.jobs.filter((j) => j.id !== id) }));
    setOpenJobId((cur) => (cur === id ? null : cur));
  }

  function updateCrime(id: string, patch: Partial<EconomyCrime>): void {
    setConfig((c) => ({
      ...c,
      crimes: c.crimes.map((crime) =>
        crime.id === id ? { ...crime, ...patch } : crime,
      ),
    }));
  }

  function addCrime(): void {
    const crime = defaultEconomyCrime({
      id: newLocalId(),
      name: "New crime",
    });
    setConfig((c) => ({ ...c, crimes: [...c.crimes, crime] }));
    setOpenCrimeId(crime.id);
    setTab("crimes");
  }

  function removeCrime(id: string): void {
    setConfig((c) => ({
      ...c,
      crimes: c.crimes.filter((crime) => crime.id !== id),
    }));
    setOpenCrimeId((cur) => (cur === id ? null : cur));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Loading income and jobs…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast ? (
        <ToastBanner
          variant={toast.variant}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Tabs>
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
              <TabsTrigger
                active={tab === "fixed"}
                onClick={() => setTab("fixed")}
              >
                Base Income
              </TabsTrigger>
              <TabsTrigger
                active={tab === "jobs"}
                onClick={() => setTab("jobs")}
              >
                Jobs
              </TabsTrigger>
              <TabsTrigger
                active={tab === "crimes"}
                onClick={() => setTab("crimes")}
              >
                Crimes
              </TabsTrigger>
              <TabsTrigger
                active={tab === "rob"}
                onClick={() => setTab("rob")}
              >
                Robbery
              </TabsTrigger>
            </TabsList>

            {tab === "fixed" ? (
              <TabsContent>
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Command Rewards
                      </CardTitle>
                      <CardDescription>
                        Fixed payouts for /daily, /weekly, and /monthly.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="daily-pay">/daily</Label>
                        <Input
                          id="daily-pay"
                          type="number"
                          min={0}
                          step={1}
                          value={config.dailyPay}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              dailyPay: Number(e.target.value) || 0,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="weekly-pay">/weekly</Label>
                        <Input
                          id="weekly-pay"
                          type="number"
                          min={0}
                          step={1}
                          value={config.weeklyPay}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              weeklyPay: Number(e.target.value) || 0,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="monthly-pay">/monthly</Label>
                        <Input
                          id="monthly-pay"
                          type="number"
                          min={0}
                          step={1}
                          value={config.monthlyPay}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              monthlyPay: Number(e.target.value) || 0,
                            }))
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Streak System
                      </CardTitle>
                      <CardDescription>
                        Multiplier for consecutive days of /daily.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-3">
                        <div>
                          <p className="text-sm font-medium">
                            Enable streak bonus
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Adds an extra % for each day in a row.
                          </p>
                        </div>
                        <Switch
                          checked={config.streakEnabled}
                          onCheckedChange={(streakEnabled) =>
                            setConfig((c) => ({ ...c, streakEnabled }))
                          }
                          aria-label="Enable streaks"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="streak-bonus">
                          Bonus per day (%)
                        </Label>
                        <Input
                          id="streak-bonus"
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          disabled={!config.streakEnabled}
                          value={config.streakBonusPercent}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              streakBonusPercent: Number(e.target.value) || 0,
                            }))
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Role Salaries
                      </CardTitle>
                      <CardDescription>
                        Payments the member claims with{" "}
                        <code className="text-xs">/collect-income</code>. Daily
                        = 24 h, weekly = 7 days. They aren't paid automatically.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {config.roleSalaries.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No salaries configured.
                        </p>
                      ) : (
                        config.roleSalaries.map((salary, index) => {
                          const selected = assignableRoles.find(
                            (r) => r.id === salary.roleId,
                          );
                          return (
                            <div
                              key={salary.id}
                              className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/10 px-3 py-2.5"
                            >
                              <Select
                                value={salary.roleId || undefined}
                                onValueChange={(roleId) =>
                                  updateSalary(index, { roleId })
                                }
                              >
                                <SelectTrigger className="h-9 min-w-[160px] flex-1">
                                  {selected ? (
                                    <span className="flex min-w-0 items-center gap-2">
                                      <RoleColorDot
                                        color={roleDotColor(selected)}
                                      />
                                      <span className="truncate">
                                        @{selected.name}
                                      </span>
                                    </span>
                                  ) : (
                                    <SelectValue placeholder="Select role" />
                                  )}
                                </SelectTrigger>
                                <SelectContent>
                                  {assignableRoles.map((role) => (
                                    <SelectItem key={role.id} value={role.id}>
                                      <span className="flex items-center gap-2">
                                        <RoleColorDot
                                          color={roleDotColor(role)}
                                        />
                                        @{role.name}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                className="h-9 w-28"
                                value={salary.amount}
                                onChange={(e) =>
                                  updateSalary(index, {
                                    amount: Number(e.target.value) || 0,
                                  })
                                }
                                aria-label="Salary amount"
                              />
                              <Select
                                value={salary.frequency}
                                onValueChange={(frequency) =>
                                  updateSalary(index, {
                                    frequency:
                                      frequency === "weekly"
                                        ? "weekly"
                                        : "daily",
                                  })
                                }
                              >
                                <SelectTrigger className="h-9 w-[130px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="daily">Daily</SelectItem>
                                  <SelectItem value="weekly">
                                    Weekly
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="shrink-0 text-muted-foreground hover:text-destructive"
                                aria-label="Delete salary"
                                onClick={() => removeSalary(index)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          );
                        })
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={addSalary}
                      >
                        <Plus className="size-4" />
                        Add salary
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            ) : null}

            {tab === "jobs" ? (
              <TabsContent>
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Briefcase className="size-4 text-primary" />
                        Jobs for /work
                      </CardTitle>
                      <CardDescription>
                        1 job → runs on its own. 2–5 → the user picks. 6+
                        → random. Variables: {"{job}"}, {"{payout}"},{" "}
                        {"{currency}"}.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {config.jobs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No jobs yet. Add the first one.
                        </p>
                      ) : (
                        <Accordion>
                          {config.jobs.map((job) => {
                            const open = openJobId === job.id;
                            return (
                              <AccordionItem key={job.id}>
                                <AccordionTrigger
                                  open={open}
                                  subtitle={`${job.minPay}–${job.maxPay} · ${job.cooldownMinutes} min`}
                                  onClick={() =>
                                    setOpenJobId(open ? null : job.id)
                                  }
                                >
                                  {job.name || "Unnamed"}
                                </AccordionTrigger>
                                <AccordionContent open={open}>
                                  <div className="space-y-4">
                                    <div className="space-y-2">
                                      <Label>Job name</Label>
                                      <Input
                                        value={job.name}
                                        onChange={(e) =>
                                          updateJob(job.id, {
                                            name: e.target.value,
                                          })
                                        }
                                        placeholder="Miner"
                                      />
                                    </div>
                                    <div className="grid gap-4 sm:grid-cols-3">
                                      <div className="space-y-2">
                                        <Label>Minimum pay</Label>
                                        <Input
                                          type="number"
                                          min={0}
                                          value={job.minPay}
                                          onChange={(e) =>
                                            updateJob(job.id, {
                                              minPay:
                                                Number(e.target.value) || 0,
                                            })
                                          }
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label>Maximum pay</Label>
                                        <Input
                                          type="number"
                                          min={0}
                                          value={job.maxPay}
                                          onChange={(e) =>
                                            updateJob(job.id, {
                                              maxPay:
                                                Number(e.target.value) || 0,
                                            })
                                          }
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label>Cooldown (min)</Label>
                                        <Input
                                          type="number"
                                          min={1}
                                          value={job.cooldownMinutes}
                                          onChange={(e) =>
                                            updateJob(job.id, {
                                              cooldownMinutes:
                                                Number(e.target.value) || 1,
                                            })
                                          }
                                        />
                                      </div>
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Success message</Label>
                                      <Textarea
                                        value={job.successMessage}
                                        onChange={(e) =>
                                          updateJob(job.id, {
                                            successMessage: e.target.value,
                                          })
                                        }
                                        placeholder="You worked as a {job} and earned {payout} coins."
                                        rows={3}
                                      />
                                    </div>
                                    <div className="flex justify-end">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => removeJob(job.id)}
                                      >
                                        <Trash2 className="size-4" />
                                        Delete job
                                      </Button>
                                    </div>
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            );
                          })}
                        </Accordion>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={addJob}
                      >
                        <Plus className="size-4" />
                        Add Job
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            ) : null}

            {tab === "crimes" ? (
              <TabsContent>
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <ShieldAlert className="size-4 text-primary" />
                        Crimes for /crime
                      </CardTitle>
                      <CardDescription>
                        1 crime → runs on its own. 2–5 → the user picks. 6+
                        → random. Variables: {"{crime}"}, {"{payout}"},{" "}
                        {"{fine}"}, {"{currency}"}.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {config.crimes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No crimes yet. Add the first one.
                        </p>
                      ) : (
                        <Accordion>
                          {config.crimes.map((crime) => {
                            const open = openCrimeId === crime.id;
                            return (
                              <AccordionItem key={crime.id}>
                                <AccordionTrigger
                                  open={open}
                                  subtitle={`${crime.successChance}% success · reward ${crime.minReward}–${crime.maxReward}`}
                                  onClick={() =>
                                    setOpenCrimeId(open ? null : crime.id)
                                  }
                                >
                                  {crime.name || "Unnamed"}
                                </AccordionTrigger>
                                <AccordionContent open={open}>
                                  <div className="space-y-4">
                                    <div className="space-y-2">
                                      <Label>Crime name</Label>
                                      <Input
                                        value={crime.name}
                                        onChange={(e) =>
                                          updateCrime(crime.id, {
                                            name: e.target.value,
                                          })
                                        }
                                        placeholder="Rob a bank"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>
                                        Success chance (%)
                                      </Label>
                                      <Input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={crime.successChance}
                                        onChange={(e) =>
                                          updateCrime(crime.id, {
                                            successChance:
                                              Number(e.target.value) || 0,
                                          })
                                        }
                                      />
                                    </div>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                      <div className="space-y-2">
                                        <Label>Min. reward</Label>
                                        <Input
                                          type="number"
                                          min={0}
                                          value={crime.minReward}
                                          onChange={(e) =>
                                            updateCrime(crime.id, {
                                              minReward:
                                                Number(e.target.value) || 0,
                                            })
                                          }
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label>Max. reward</Label>
                                        <Input
                                          type="number"
                                          min={0}
                                          value={crime.maxReward}
                                          onChange={(e) =>
                                            updateCrime(crime.id, {
                                              maxReward:
                                                Number(e.target.value) || 0,
                                            })
                                          }
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label>Min. fine</Label>
                                        <Input
                                          type="number"
                                          min={0}
                                          value={crime.minFine}
                                          onChange={(e) =>
                                            updateCrime(crime.id, {
                                              minFine:
                                                Number(e.target.value) || 0,
                                            })
                                          }
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label>Max. fine</Label>
                                        <Input
                                          type="number"
                                          min={0}
                                          value={crime.maxFine}
                                          onChange={(e) =>
                                            updateCrime(crime.id, {
                                              maxFine:
                                                Number(e.target.value) || 0,
                                            })
                                          }
                                        />
                                      </div>
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Success message</Label>
                                      <Textarea
                                        value={crime.successMessage}
                                        onChange={(e) =>
                                          updateCrime(crime.id, {
                                            successMessage: e.target.value,
                                          })
                                        }
                                        rows={3}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Failure message</Label>
                                      <Textarea
                                        value={crime.failMessage}
                                        onChange={(e) =>
                                          updateCrime(crime.id, {
                                            failMessage: e.target.value,
                                          })
                                        }
                                        rows={3}
                                      />
                                    </div>
                                    <div className="flex justify-end">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => removeCrime(crime.id)}
                                      >
                                        <Trash2 className="size-4" />
                                        Delete crime
                                      </Button>
                                    </div>
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            );
                          })}
                        </Accordion>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={addCrime}
                      >
                        <Plus className="size-4" />
                        Add Crime
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            ) : null}

            {tab === "rob" ? (
              <TabsContent>
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">/rob</CardTitle>
                      <CardDescription>
                        Off by default. Only steals from the wallet; the bank is
                        a safe zone. The cooldown starts after the attempt.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label htmlFor="rob-enabled">Enable /rob</Label>
                          <p className="text-xs text-muted-foreground">
                            If off, the command replies that it's disabled.
                          </p>
                        </div>
                        <Switch
                          id="rob-enabled"
                          checked={config.rob.enabled}
                          onCheckedChange={(enabled) =>
                            setConfig((c) => ({
                              ...c,
                              rob: { ...c.rob, enabled },
                            }))
                          }
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="rob-chance">Success (%)</Label>
                          <Input
                            id="rob-chance"
                            type="number"
                            min={0}
                            max={100}
                            value={config.rob.successChance}
                            onChange={(e) =>
                              setConfig((c) => ({
                                ...c,
                                rob: {
                                  ...c.rob,
                                  successChance: Number(e.target.value) || 0,
                                },
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="rob-cd">Cooldown (min)</Label>
                          <Input
                            id="rob-cd"
                            type="number"
                            min={1}
                            value={config.rob.cooldownMinutes}
                            onChange={(e) =>
                              setConfig((c) => ({
                                ...c,
                                rob: {
                                  ...c.rob,
                                  cooldownMinutes: Number(e.target.value) || 1,
                                },
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="rob-min">Min. victim wallet</Label>
                          <Input
                            id="rob-min"
                            type="number"
                            min={0}
                            value={config.rob.minTargetWallet}
                            onChange={(e) =>
                              setConfig((c) => ({
                                ...c,
                                rob: {
                                  ...c.rob,
                                  minTargetWallet: Number(e.target.value) || 0,
                                },
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="rob-fine">Fine on failure (%)</Label>
                          <Input
                            id="rob-fine"
                            type="number"
                            min={0}
                            max={100}
                            value={config.rob.failFinePercent}
                            onChange={(e) =>
                              setConfig((c) => ({
                                ...c,
                                rob: {
                                  ...c.rob,
                                  failFinePercent: Number(e.target.value) || 0,
                                },
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="rob-steal-min">Min. steal (%)</Label>
                          <Input
                            id="rob-steal-min"
                            type="number"
                            min={0}
                            max={100}
                            value={config.rob.minStealPercent}
                            onChange={(e) =>
                              setConfig((c) => ({
                                ...c,
                                rob: {
                                  ...c.rob,
                                  minStealPercent: Number(e.target.value) || 0,
                                },
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="rob-steal-max">Max. steal (%)</Label>
                          <Input
                            id="rob-steal-max"
                            type="number"
                            min={0}
                            max={100}
                            value={config.rob.maxStealPercent}
                            onChange={(e) =>
                              setConfig((c) => ({
                                ...c,
                                rob: {
                                  ...c.rob,
                                  maxStealPercent: Number(e.target.value) || 0,
                                },
                              }))
                            }
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            ) : null}
          </Tabs>
        </div>

        <Card className="sticky top-4 self-start">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Simulator</CardTitle>
            <CardDescription>
              Preview of the Discord message based on the active tab.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tab === "crimes" ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={crimeOutcome === "success" ? "default" : "outline"}
                  onClick={() => setCrimeOutcome("success")}
                >
                  Success
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={crimeOutcome === "fail" ? "default" : "outline"}
                  onClick={() => setCrimeOutcome("fail")}
                >
                  Failure
                </Button>
              </div>
            ) : null}

            <EconomyJobsDiscordPreview
              tab={tab}
              config={config}
              currencyName={currencyName}
              currencySymbol={currencySymbol}
              activeJob={activeJob}
              activeCrime={activeCrime}
              crimeOutcome={crimeOutcome}
            />

            <Button
              type="button"
              className="w-full"
              disabled={saving || !dirty}
              onClick={() => void handleSave()}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save Income Configuration
            </Button>
            {dirty ? (
              <p className="text-center text-xs text-muted-foreground">
                You have unsaved changes.
              </p>
            ) : (
              <p
                className={cn(
                  "text-center text-xs",
                  "text-emerald-600 dark:text-emerald-400",
                )}
              >
                All saved.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
