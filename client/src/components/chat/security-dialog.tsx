import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Shield, Lock, Eye, EyeOff } from "lucide-react";
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
import { apiRequest } from "@/lib/queryClient";

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

  const form = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = async (data: PasswordFormData) => {
    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/auth/change-password", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      toast({
        title: t("security.passwordChanged"),
        description: t("security.passwordChangedDesc"),
      });
      form.reset();
      onOpenChange(false);
    } catch (error: unknown) {
      toast({
        title: t("security.changeFailed"),
        description: error instanceof Error ? error.message : t("auth.pleaseRetry"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("security.title")}
          </DialogTitle>
          <DialogDescription>
            {t("security.description")}
          </DialogDescription>
        </DialogHeader>

        {isAnonymous ? (
          <div className="py-6 text-center">
            <p className="text-muted-foreground">{t("security.anonymousWarning")}</p>
          </div>
        ) : (
          <Form {...form} key="security-form">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
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

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => onOpenChange(false)}
                >
                  {t("dialog.cancel")}
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isLoading}
                  data-testid="button-change-password"
                >
                  {isLoading ? t("security.changing") : t("security.changePassword")}
                </Button>
              </div>
            </form>
          </Form>
        )}

        {isAnonymous && (
          <div className="flex justify-end pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("dialog.close")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
