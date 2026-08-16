import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import type {
  RolePermissionGroup,
  RolesBuilderListResponse,
  RolesBuilderRole,
} from "@adobos/shared";
import { ROLE_PERMISSION_GROUPS } from "@adobos/shared";
import {
  createGuildRole,
  fetchRolesBuilderList,
  updateRolePositions,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToastBanner } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  GripVertical,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Shield,
} from "lucide-react";

const PRESET_COLORS = [
  "#99AAB5",
  "#1ABC9C",
  "#2ECC71",
  "#3498DB",
  "#9B59B6",
  "#E91E63",
  "#F1C40F",
  "#E67E22",
  "#E74C3C",
  "#95A5A6",
  "#607D8B",
  "#11806A",
  "#1F8B4C",
  "#206694",
  "#71368A",
  "#AD1457",
  "#C27C0E",
  "#A84300",
  "#992D22",
  "#979C9F",
] as const;

function RoleColorDot({ hex }: { hex: string }) {
  const color =
    !hex || hex.toUpperCase() === "#000000" ? "#99AAB5" : hex.toUpperCase();
  return (
    <span
      className="inline-block size-3 shrink-0 rounded-full ring-1 ring-border"
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}

function isRoleLocked(
  role: RolesBuilderRole,
  botHighestPosition: number,
  botHighestRoleId: string | null,
): boolean {
  if (botHighestRoleId && role.id === botHighestRoleId) return true;
  if (role.position >= botHighestPosition) return true;
  if (role.managed) return true;
  return false;
}

function rolesOrderFingerprint(roles: RolesBuilderRole[]): string {
  return roles.map((r) => r.id).join("|");
}

/** Reordena solo entre slots desbloqueados; los bloqueados conservan su índice. */
function reorderKeepingLocks(
  list: RolesBuilderRole[],
  lockedIds: Set<string>,
  sourceIndex: number,
  destIndex: number,
): RolesBuilderRole[] {
  if (sourceIndex === destIndex) return list;
  if (lockedIds.has(list[sourceIndex]?.id ?? "")) return list;

  const lockedSlots = list
    .map((role, index) => ({ role, index }))
    .filter(({ role }) => lockedIds.has(role.id));

  const movables = list.filter((role) => !lockedIds.has(role.id));
  const sourceMovableIndex = movables.findIndex(
    (role) => role.id === list[sourceIndex]?.id,
  );

  let destMovableIndex = 0;
  for (let i = 0; i < destIndex; i += 1) {
    const id = list[i]?.id;
    if (id && !lockedIds.has(id)) destMovableIndex += 1;
  }
  if (sourceIndex < destIndex) {
    destMovableIndex = Math.max(0, destMovableIndex - 1);
  }

  if (sourceMovableIndex < 0) return list;
  const nextMovables = [...movables];
  const [moved] = nextMovables.splice(sourceMovableIndex, 1);
  if (!moved) return list;
  nextMovables.splice(
    Math.min(destMovableIndex, nextMovables.length),
    0,
    moved,
  );

  const result: RolesBuilderRole[] = [];
  let movableCursor = 0;
  for (let i = 0; i < list.length; i += 1) {
    const locked = lockedSlots.find((slot) => slot.index === i);
    if (locked) {
      result.push(locked.role);
    } else {
      const next = nextMovables[movableCursor];
      if (next) result.push(next);
      movableCursor += 1;
    }
  }
  return result;
}

/**
 * Asigna posiciones Discord a partir del orden visual (arriba = mayor).
 * Los roles managed ocupan hueco en el índice pero no se envían.
 */
function buildPositionPayload(
  ordered: RolesBuilderRole[],
  botHighestPosition: number,
  botHighestRoleId: string | null,
): { roleId: string; position: number }[] {
  const belowBot = ordered.filter(
    (role) =>
      role.id !== botHighestRoleId && role.position < botHighestPosition,
  );

  return belowBot
    .map((role, index) => ({
      roleId: role.id,
      position: botHighestPosition - 1 - index,
      managed: role.managed,
    }))
    .filter((row) => !row.managed)
    .map(({ roleId, position }) => ({ roleId, position }));
}

const PERMISSION_TAB_SHORT: Record<string, string> = {
  general: "General",
  moderation: "Moderación",
  membership: "Membresía",
  voice: "Voz",
};

function PermissionsTabs({
  groups,
  selected,
  onToggle,
}: {
  groups: RolePermissionGroup[];
  selected: Set<string>;
  onToggle: (key: string, enabled: boolean) => void;
}) {
  const [tab, setTab] = useState(groups[0]?.id ?? "general");
  const activeGroup = groups.find((g) => g.id === tab) ?? groups[0];

  return (
    <Tabs className="space-y-0">
      <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
        {groups.map((group) => {
          const enabledCount = group.permissions.filter((p) =>
            selected.has(p.key),
          ).length;
          const short =
            PERMISSION_TAB_SHORT[group.id] ?? group.label.split(" ")[0]!;
          return (
            <TabsTrigger
              key={group.id}
              className="h-auto min-h-9 w-full flex-col gap-0.5 px-1.5 py-1.5 text-xs sm:text-sm"
              active={tab === group.id}
              onClick={() => setTab(group.id)}
            >
              <span>{short}</span>
              <span className="text-[10px] font-normal text-muted-foreground">
                {enabledCount}/{group.permissions.length}
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>

      {activeGroup ? (
        <TabsContent className="mt-3">
          <div className="min-h-[18rem] space-y-2 sm:min-h-[20rem]">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {activeGroup.permissions.map((perm) => (
                <div
                  key={perm.key}
                  className="flex items-start justify-between gap-3 rounded-md border border-border/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <Label className="text-sm font-normal leading-snug">
                      {perm.label}
                    </Label>
                    {perm.description ? (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {perm.description}
                      </p>
                    ) : null}
                  </div>
                  <Switch
                    checked={selected.has(perm.key)}
                    onCheckedChange={(checked) => onToggle(perm.key, checked)}
                  />
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      ) : null}
    </Tabs>
  );
}

function RolesHierarchyPanel({
  roles,
  botHighestPosition,
  botHighestRoleId,
  dirty,
  saving,
  canManage,
  onReorder,
  onSave,
}: {
  roles: RolesBuilderRole[];
  botHighestPosition: number;
  botHighestRoleId: string | null;
  dirty: boolean;
  saving: boolean;
  canManage: boolean;
  onReorder: (next: RolesBuilderRole[]) => void;
  onSave: () => void;
}) {
  const lockedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const role of roles) {
      if (isRoleLocked(role, botHighestPosition, botHighestRoleId)) {
        ids.add(role.id);
      }
    }
    return ids;
  }, [roles, botHighestPosition, botHighestRoleId]);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination || !canManage) return;
    const next = reorderKeepingLocks(
      roles,
      lockedIds,
      result.source.index,
      result.destination.index,
    );
    onReorder(next);
  };

  return (
    <div className="space-y-3">
      {dirty ? (
        <Button
          type="button"
          className="w-full"
          disabled={saving || !canManage}
          onClick={onSave}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Guardar nueva jerarquía
        </Button>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Arrastra los roles gestionables para cambiar la prioridad. Los roles
        bloqueados (por encima del bot, managed o el propio bot) no se mueven.
      </p>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="guild-roles">
          {(dropProvided, dropSnapshot) => (
            <div
              ref={dropProvided.innerRef}
              {...dropProvided.droppableProps}
              className={cn(
                "max-h-[32rem] space-y-1.5 overflow-y-auto rounded-md pr-1",
                dropSnapshot.isDraggingOver && "bg-muted/20",
              )}
            >
              {roles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay roles en este servidor.
                </p>
              ) : (
                roles.map((role, index) => {
                  const locked = lockedIds.has(role.id);
                  return (
                    <Draggable
                      key={role.id}
                      draggableId={role.id}
                      index={index}
                      isDragDisabled={locked || !canManage}
                    >
                      {(dragProvided, dragSnapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...dragProvided.dragHandleProps}
                          className={cn(
                            "flex items-center gap-2 rounded-md border border-border/60 bg-card px-2.5 py-2 text-sm",
                            locked
                              ? "cursor-not-allowed opacity-70"
                              : "cursor-grab active:cursor-grabbing",
                            dragSnapshot.isDragging &&
                              "opacity-80 shadow-lg ring-1 ring-primary/40",
                          )}
                          style={dragProvided.draggableProps.style}
                        >
                          {locked ? (
                            <Lock className="size-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <RoleColorDot hex={role.hexColor} />
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {role.name}
                          </span>
                          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                            pos {role.position}
                          </span>
                          {locked ? (
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {role.managed
                                ? "managed"
                                : "No gestionable"}
                            </span>
                          ) : null}
                        </div>
                      )}
                    </Draggable>
                  );
                })
              )}
              {dropProvided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}

export function RolesBuilderDashboard() {
  const [data, setData] = useState<RolesBuilderListResponse | null>(null);
  const [orderedRoles, setOrderedRoles] = useState<RolesBuilderRole[]>([]);
  const [savedFingerprint, setSavedFingerprint] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingHierarchy, setSavingHierarchy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [color, setColor] = useState("#5865F2");
  const [hoist, setHoist] = useState(false);
  const [mentionable, setMentionable] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(
    () => new Set(),
  );

  const permissionGroups = data?.permissionGroups ?? ROLE_PERMISSION_GROUPS;

  const dirtyHierarchy = useMemo(
    () => rolesOrderFingerprint(orderedRoles) !== savedFingerprint,
    [orderedRoles, savedFingerprint],
  );

  const applyList = useCallback((res: RolesBuilderListResponse) => {
    setData(res);
    setOrderedRoles(res.roles);
    setSavedFingerprint(rolesOrderFingerprint(res.roles));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRolesBuilderList();
      applyList(res);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el Fabricador de Roles.",
      );
    } finally {
      setLoading(false);
    }
  }, [applyList]);

  useEffect(() => {
    void load();
  }, [load]);

  const togglePerm = (key: string, enabled: boolean) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (enabled) next.add(key);
      else next.delete(key);
      return next;
    });
    setSuccess(null);
  };

  const resetForm = () => {
    setName("");
    setColor("#5865F2");
    setHoist(false);
    setMentionable(false);
    setSelectedPerms(new Set());
  };

  const onCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Escribe un nombre para el rol.");
      return;
    }

    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await createGuildRole({
        name: trimmed,
        color,
        permissions: [...selectedPerms],
        hoist,
        mentionable,
      });
      setSuccess(
        res.warning
          ? `Rol «${res.role.name}» creado. ${res.warning}`
          : `Rol «${res.role.name}» creado en Discord.`,
      );
      resetForm();
      const list = await fetchRolesBuilderList();
      applyList(list);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo crear el rol en Discord.",
      );
    } finally {
      setCreating(false);
    }
  };

  const onSaveHierarchy = async () => {
    if (!data) return;
    setSavingHierarchy(true);
    setError(null);
    setSuccess(null);
    try {
      const positions = buildPositionPayload(
        orderedRoles,
        data.botHighestPosition,
        data.botHighestRoleId,
      );
      const res = await updateRolePositions({ positions });
      setOrderedRoles(res.roles);
      setSavedFingerprint(rolesOrderFingerprint(res.roles));
      setData((prev) => (prev ? { ...prev, roles: res.roles } : prev));
      setSuccess("Jerarquía de roles actualizada en Discord.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar la nueva jerarquía.",
      );
    } finally {
      setSavingHierarchy(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Cargando roles del servidor…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <ToastBanner
          variant="error"
          message={error}
          onDismiss={() => setError(null)}
        />
      ) : null}
      {success ? (
        <ToastBanner
          variant="success"
          message={success}
          onDismiss={() => setSuccess(null)}
        />
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Fabricador de Roles
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea roles y reordena la jerarquía con arrastrar y soltar.
            {data ? ` · ${data.guildName}` : null}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || creating || savingHierarchy}
          onClick={() => void load()}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Actualizar
        </Button>
      </div>

      {data && !data.botCanManageRoles ? (
        <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            El bot no tiene el permiso <strong>Gestionar roles</strong>. No
            podrá crear ni reordenar roles hasta que se lo otorgues en Discord.
          </p>
        </div>
      ) : null}

      {data && data.botCanManageRoles && data.botHighestPosition <= 1 ? (
        <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            El rol del bot está muy abajo en la jerarquía
            {data.botRoleName ? ` («${data.botRoleName}»)` : ""}. Sube el rol
            del bot en Discord para poder posicionar roles.
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="size-4 text-primary" />
              Nuevo rol
            </CardTitle>
            <CardDescription>
              Nombre, color y permisos. Se crea justo debajo del rol del bot.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="roleName">Nombre del rol</Label>
              <Input
                id="roleName"
                value={name}
                maxLength={100}
                placeholder="ej. Moderador"
                onChange={(e) => {
                  setName(e.target.value);
                  setSuccess(null);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="color"
                  aria-label="Color del rol"
                  className="h-10 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
                  value={color}
                  onChange={(e) => {
                    setColor(e.target.value.toUpperCase());
                    setSuccess(null);
                  }}
                />
                <Input
                  className="max-w-[9rem] font-mono"
                  value={color}
                  onChange={(e) => {
                    setColor(e.target.value);
                    setSuccess(null);
                  }}
                  placeholder="#5865F2"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    title={preset}
                    className={cn(
                      "size-6 rounded-md ring-1 ring-border transition-transform hover:scale-110",
                      color.toUpperCase() === preset &&
                        "ring-2 ring-primary ring-offset-2 ring-offset-background",
                    )}
                    style={{ backgroundColor: preset }}
                    onClick={() => {
                      setColor(preset);
                      setSuccess(null);
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2">
                <Label className="text-sm font-normal">
                  Mostrar separado (hoist)
                </Label>
                <Switch checked={hoist} onCheckedChange={setHoist} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2">
                <Label className="text-sm font-normal">Mencionable</Label>
                <Switch
                  checked={mentionable}
                  onCheckedChange={setMentionable}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Accordion>
                <AccordionItem>
                  <AccordionTrigger
                    open={permissionsOpen}
                    onClick={() => setPermissionsOpen((v) => !v)}
                    subtitle={
                      selectedPerms.size > 0
                        ? `${selectedPerms.size} permiso${selectedPerms.size === 1 ? "" : "s"} seleccionado${selectedPerms.size === 1 ? "" : "s"}`
                        : "Cerrado por defecto — opcional"
                    }
                  >
                    Permisos
                  </AccordionTrigger>
                  <AccordionContent open={permissionsOpen}>
                    <PermissionsTabs
                      groups={permissionGroups}
                      selected={selectedPerms}
                      onToggle={togglePerm}
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={
                creating || !data?.botCanManageRoles || !name.trim()
              }
              onClick={() => void onCreate()}
            >
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Crear Rol en Discord
            </Button>
          </CardContent>
        </Card>

        <Card className="h-fit lg:sticky lg:top-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Roles del servidor</CardTitle>
            <CardDescription>
              Arrastra para reordenar (arriba = mayor prioridad).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RolesHierarchyPanel
              roles={orderedRoles}
              botHighestPosition={data?.botHighestPosition ?? 0}
              botHighestRoleId={data?.botHighestRoleId ?? null}
              dirty={dirtyHierarchy}
              saving={savingHierarchy}
              canManage={Boolean(data?.botCanManageRoles)}
              onReorder={(next) => {
                setOrderedRoles(next);
                setSuccess(null);
              }}
              onSave={() => void onSaveHierarchy()}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
