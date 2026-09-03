import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Pencil,
  Rocket,
  Trash2,
} from "lucide-react";
import type {
  EmbedLibraryResponse,
  EmbedTemplateSummary,
  SentEmbedRecord,
} from "@adobos/shared";
import {
  deleteEmbedTemplate,
  deleteSentEmbed,
  fetchEmbedLibrary,
} from "@/lib/api";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type LibrarySubTab = "sent" | "templates";

interface EmbedLibraryProps {
  onEditSent: (entry: SentEmbedRecord) => void;
  onLoadTemplate: (templateId: number) => void;
  onToast: (message: string, kind: "ok" | "error") => void;
}

export function EmbedLibraryPanel({
  onEditSent,
  onLoadTemplate,
  onToast,
}: EmbedLibraryProps) {
  const [subTab, setSubTab] = useState<LibrarySubTab>("sent");
  const [data, setData] = useState<EmbedLibraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleteSentId, setDeleteSentId] = useState<string | null>(null);
  const [deleteTemplateId, setDeleteTemplateId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchEmbedLibrary());
    } catch (error: unknown) {
      onToast(
        error instanceof Error ? error.message : "Couldn't load the library",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function confirmDeleteSent(): Promise<void> {
    if (!deleteSentId) return;
    setBusy(true);
    try {
      const result = await deleteSentEmbed(deleteSentId);
      onToast(
        result.orphaned
          ? "Record cleaned: the message no longer existed in Discord."
          : "Message deleted from Discord and the registry.",
        "ok",
      );
      setDeleteSentId(null);
      await refresh();
    } catch (error: unknown) {
      onToast(
        error instanceof Error ? error.message : "Couldn't delete",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteTemplate(): Promise<void> {
    if (deleteTemplateId == null) return;
    setBusy(true);
    try {
      await deleteEmbedTemplate(deleteTemplateId);
      onToast("Template deleted.", "ok");
      setDeleteTemplateId(null);
      await refresh();
    } catch (error: unknown) {
      onToast(
        error instanceof Error ? error.message : "Couldn't delete template",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString("en-US");
    } catch {
      return iso;
    }
  }

  const templates: EmbedTemplateSummary[] = data?.templates ?? [];
  const sent = data?.sentMessages ?? [];

  return (
    <div className="space-y-4">
      <Tabs>
        <TabsList className="grid h-auto w-full grid-cols-2">
          <TabsTrigger
            active={subTab === "sent"}
            onClick={() => setSubTab("sent")}
          >
            Sent Messages
          </TabsTrigger>
          <TabsTrigger
            active={subTab === "templates"}
            onClick={() => setSubTab("templates")}
          >
            Plantillas Guardadas
          </TabsTrigger>
        </TabsList>

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </p>
        ) : subTab === "sent" ? (
          <TabsContent>
            {sent.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>No messages sent</CardTitle>
                  <CardDescription>
                    Embeds you send from the creator will appear here.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {sent.map((entry) => (
                  <Card key={entry.id} className="flex flex-col">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base leading-snug">
                          {entry.title ||
                            entry.embedData.title ||
                            entry.embedData.content?.slice(0, 40) ||
                            "Untitled"}
                        </CardTitle>
                        <Badge className="border-sky-500/40 bg-sky-500/15 text-sky-300">
                          Sent
                        </Badge>
                      </div>
                      <CardDescription>
                        #{entry.channelName ?? entry.channelId}
                        <br />
                        {formatDate(entry.createdAt)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto flex flex-col gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        onClick={() => onEditSent(entry)}
                      >
                        <Pencil className="size-4" aria-hidden />
                        Edit in Discord
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="w-full text-destructive hover:text-destructive"
                        onClick={() => setDeleteSentId(entry.id)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Delete from Discord
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        ) : (
          <TabsContent>
            {templates.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>No templates</CardTitle>
                  <CardDescription>
                    Use "Save as Template" in the creator.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {templates.map((tpl) => (
                  <Card key={tpl.id} className="flex flex-col">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base leading-snug">
                          {tpl.name}
                        </CardTitle>
                        <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-300">
                          Plantilla
                        </Badge>
                      </div>
                      <CardDescription>
                        {formatDate(tpl.createdAt)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto flex flex-col gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        onClick={() => onLoadTemplate(tpl.id)}
                      >
                        <Rocket className="size-4" aria-hidden />
                        Cargar en Editor
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="w-full text-destructive hover:text-destructive"
                        onClick={() => setDeleteTemplateId(tpl.id)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Delete Template
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      <AlertDialog
        open={deleteSentId != null}
        title="Delete message from Discord"
        description="The message in the channel and the local record will be deleted. If it no longer exists in Discord, only the record is cleaned up."
        confirmLabel="Delete"
        tone="destructive"
        confirming={busy}
        onCancel={() => setDeleteSentId(null)}
        onConfirm={() => void confirmDeleteSent()}
      />

      <AlertDialog
        open={deleteTemplateId != null}
        title="Delete template"
        description="This action can't be undone."
        confirmLabel="Delete"
        tone="destructive"
        confirming={busy}
        onCancel={() => setDeleteTemplateId(null)}
        onConfirm={() => void confirmDeleteTemplate()}
      />
    </div>
  );
}
