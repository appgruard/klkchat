import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Shield, Lock, Eye, EyeOff, Trash2, Ban, Unlock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { UserPublic } from "@shared/schema";
import { useAuth } from "@/lib/auth-context";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "validation.currentPasswordRequired"),
  newPassword: z.string().min(6, "validation.passwordMin"),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "validation.passwordsMatch",
  path: ["confirmPassword"],
});

type PasswordFormData = z.infer<typeof passwordSchema>;

interface SecurityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAnonymous: boolean;
}

export function SecurityDialog({ open, onOpenChange, isAnonymous }: SecurityDialogProps) {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { logout } = useAuth();
  const [deletePassword, setDeletePassword] = useState("");

  const { data: blockedUsers = [], isLoading: loadingBlocked, error: blockedError } = useQuery<UserPublic[]>({
    queryKey: ["/api/users/blocked"],
    enabled: open,
  });

  if (blockedError) {
    console.error("Error fetching blocked users:", blockedError);
  }

  const form = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: PasswordFormData) => {
      await apiRequest("POST", "/api/auth/change-password", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
    },
    onSuccess: () => {
      toast({
        title: t("security.passwordChanged"),
        description: t("security.passwordChangedDesc"),
      });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: t("security.changeFailed"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const unblockMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("POST", `/api/users/${userId}/unblock`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/blocked"] });
      toast({ title: t("security.unblockedSuccess", "Usuario desbloqueado") });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/delete-account", { password: deletePassword });
    },
    onSuccess: () => {
      toast({ title: t("security.accountDeleted", "Cuenta eliminada") });
      logout();
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("security.title")}
          </DialogTitle>
          <DialogDescription>
            {t("security.description")}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="password" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="password">{t("security.password", "Contraseña")}</TabsTrigger>
            <TabsTrigger value="blocked">{t("security.blocked", "Bloqueados")}</TabsTrigger>
            <TabsTrigger value="danger" className="text-destructive">{t("security.delete", "Eliminar")}</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4 pr-4">
            <TabsContent value="password" className="m-0 space-y-4">
              {isAnonymous ? (
                <div className="py-6 text-center">
                  <p className="text-muted-foreground">{t("security.anonymousWarning")}</p>
                </div>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit((data) => changePasswordMutation.mutate(data))} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="currentPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("security.currentPassword")}</FormLabel>
                          <FormControl>
                            <div className="relative flex items-center">
                              <Lock className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                              <Input
                                {...field}
                                type={showPassword ? "text" : "password"}
                                placeholder={t("security.enterCurrentPassword")}
                                className="pl-10 pr-10"
                                data-testid="input-current-password"
                              />
                              <button
                                type="button"
                                className="absolute right-3 text-muted-foreground hover:text-foreground"
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="newPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("security.newPassword")}</FormLabel>
                          <FormControl>
                            <div className="relative flex items-center">
                              <Lock className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                              <Input
                                {...field}
                                type={showPassword ? "text" : "password"}
                                placeholder={t("security.enterNewPassword")}
                                className="pl-10"
                                data-testid="input-new-password"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("form.confirmPassword")}</FormLabel>
                          <FormControl>
                            <div className="relative flex items-center">
                              <Lock className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                              <Input
                                {...field}
                                type={showPassword ? "text" : "password"}
                                placeholder={t("form.confirmYourPassword")}
                                className="pl-10"
                                data-testid="input-confirm-new-password"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={changePasswordMutation.isPending}
                    >
                      {changePasswordMutation.isPending ? t("security.changing") : t("security.changePassword")}
                    </Button>
                  </form>
                </Form>
              )}
            </TabsContent>

            <TabsContent value="blocked" className="m-0 space-y-4">
              <div className="space-y-4">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Ban className="h-4 w-4" />
                  {t("security.blockedUsers", "Usuarios Bloqueados")}
                </h3>
                {loadingBlocked ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
                ) : blockedUsers.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">{t("security.noBlockedUsers", "No tienes usuarios bloqueados.")}</div>
                ) : (
                  <div className="space-y-2">
                    {blockedUsers.map((user) => (
                      <div key={user.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            {user.avatarUrl ? (
                              <img src={user.avatarUrl} alt={user.displayName || user.username} className="h-full w-full object-cover" />
                            ) : (
                              <AvatarFallback className="text-[10px]">{getInitials(user.displayName || user.username)}</AvatarFallback>
                            )}
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{user.displayName || user.username}</p>
                            <p className="text-xs text-muted-foreground">@{user.username}</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => unblockMutation.mutate(user.id)}
                          disabled={unblockMutation.isPending}
                        >
                          <Unlock className="h-4 w-4 mr-1" />
                          {t("security.unblock", "Desbloquear")}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="danger" className="m-0 space-y-4">
              {!isAnonymous ? (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-destructive flex items-center gap-2">
                    <Trash2 className="h-4 w-4" />
                    {t("security.deleteAccount", "Eliminar Cuenta")}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {t("security.deleteAccountWarn", "Esta acción es irreversible. Se eliminarán todos tus mensajes y contactos.")}
                  </p>
                  <div className="space-y-2">
                    <Input
                      type="password"
                      placeholder={t("form.password", "Ingresa tu contraseña para confirmar")}
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                    />
                    <Button
                      variant="destructive"
                      className="w-full"
                      disabled={!deletePassword || deleteAccountMutation.isPending}
                      onClick={() => deleteAccountMutation.mutate()}
                    >
                      {deleteAccountMutation.isPending ? t("common.deleting") : t("security.confirmDelete", "Eliminar mi cuenta permanentemente")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-muted-foreground">{t("security.anonymousDeleteInfo", "Como usuario anónimo, tu cuenta se perderá al cerrar sesión o limpiar el navegador.")}</p>
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="flex justify-end pt-2 border-t mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("dialog.close")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
