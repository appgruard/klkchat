import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { User, Lock, Eye, EyeOff, Shield } from "lucide-react";
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
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";

const convertSchema = z.object({
  username: z.string()
    .min(3, "validation.usernameMin")
    .max(30, "validation.usernameMax")
    .regex(/^[a-zA-Z0-9_]+$/, "validation.usernameChars"),
  password: z.string().min(6, "validation.passwordMin"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "validation.passwordsMatch",
  path: ["confirmPassword"],
});

type ConvertFormData = z.infer<typeof convertSchema>;

interface ConvertAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConvertAccountDialog({
  open,
  onOpenChange,
}: ConvertAccountDialogProps) {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { convertAnonymous } = useAuth();
  const { toast } = useToast();

  const form = useForm<ConvertFormData>({
    resolver: zodResolver(convertSchema),
    defaultValues: { username: "", password: "", confirmPassword: "" },
  });

  const onSubmit = async (data: ConvertFormData) => {
    setIsLoading(true);
    try {
      await convertAnonymous(data.username, data.password);
      toast({
        title: t("auth.accountCreated"),
        description: t("auth.welcomeToApp"),
      });
      onOpenChange(false);
    } catch (error: unknown) {
      toast({
        title: t("auth.registrationFailed"),
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
            <Shield className="h-5 w-5 text-primary" />
            {t("dialog.createPermanentAccount")}
          </DialogTitle>
          <DialogDescription>
            {t("dialog.convertAccountDesc")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("form.username")}</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        {...field}
                        placeholder={t("form.chooseUsername")}
                        className="pl-10"
                        data-testid="input-convert-username"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("form.password")}</FormLabel>
                  <FormControl>
                    <div className="relative flex items-center">
                      <Lock className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        {...field}
                        type={showPassword ? "text" : "password"}
                        placeholder={t("form.createPassword")}
                        className="pl-10 pr-10"
                        data-testid="input-convert-password"
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
                        data-testid="input-convert-confirm-password"
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
                data-testid="button-convert-submit"
              >
                {isLoading ? t("dialog.creating") : t("auth.createAccount")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
