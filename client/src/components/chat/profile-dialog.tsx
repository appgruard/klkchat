import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { User, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import type { UserPublic } from "@shared/schema";

const profileSchema = z.object({
  displayName: z.string().min(1, "validation.displayNameRequired").max(50),
  email: z.string().email("validation.invalidEmail").optional().or(z.literal("")),
});

type ProfileFormData = z.infer<typeof profileSchema>;

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserPublic;
}

export function ProfileDialog({ open, onOpenChange, user }: ProfileDialogProps) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: { 
      displayName: user.displayName || "",
      email: (user as any).email || "",
    },
  });

  const onSendVerification = async () => {
    setIsSendingCode(true);
    try {
      await apiRequest("POST", "/api/auth/verify-email", {});
      setIsVerifying(true);
      toast({
        title: t("profile.codeSent"),
        description: t("profile.codeSentDesc"),
      });
    } catch (error: any) {
      toast({
        title: t("profile.error"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSendingCode(false);
    }
  };

  const onConfirmVerification = async () => {
    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/auth/confirm-email", { code: verificationCode });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setIsVerifying(false);
      setVerificationCode("");
      toast({
        title: t("profile.verified"),
        description: t("profile.verifiedDesc"),
      });
    } catch (error: any) {
      toast({
        title: t("profile.error"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const onAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("avatar", file);

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        body: formData,
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Upload failed");
      }
      
      const updatedUser = await res.json();
      
      e.target.value = "";
      await queryClient.setQueryData(["/api/auth/me"], updatedUser);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      
      toast({
        title: t("profile.updated"),
        description: t("profile.avatarUpdated"),
      });
    } catch (error: any) {
      toast({
        title: t("profile.updateFailed"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (data: ProfileFormData) => {
    setIsLoading(true);
    try {
      const isNewEmail = data.email && data.email !== (user as any).email;
      
      await apiRequest("PATCH", "/api/auth/profile", { 
        displayName: data.displayName,
        email: data.email || null,
      });
      
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      
      toast({
        title: t("profile.updated"),
        description: t("profile.updatedDesc"),
      });

      if (isNewEmail) {
        // Automatically trigger verification if a new email was set
        await onSendVerification();
      } else {
        onOpenChange(false);
      }
    } catch (error: unknown) {
      toast({
        title: t("profile.updateFailed"),
        description: error instanceof Error ? error.message : t("auth.pleaseRetry"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const displayName = user.displayName || user.username;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {t("profile.title")}
          </DialogTitle>
          <DialogDescription>
            {t("profile.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <div className="relative group">
            <Avatar className="h-20 w-20">
              {(user as any).avatarUrl ? (
                <img src={(user as any).avatarUrl} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                  {getInitials(displayName)}
                </AvatarFallback>
              )}
            </Avatar>
            <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 group-hover:opacity-100 cursor-pointer rounded-full transition-opacity">
              <span className="text-xs font-medium">{t("profile.change")}</span>
              <input type="file" className="hidden" accept="image/*,image/gif" onChange={onAvatarUpload} disabled={isLoading} />
            </label>
          </div>
          <p className="text-sm text-muted-foreground">@{user.username}</p>
        </div>

        <Form {...form} key="profile-form">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("form.displayName")}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={t("form.howToCallYou")}
                      data-testid="input-profile-display-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center justify-between">
                    {t("form.email")}
                    {user.email && !(user as any).emailVerified && !isVerifying && (
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        className="h-auto p-0 text-primary hover:bg-transparent underline-offset-4 hover:underline" 
                        onClick={onSendVerification}
                        disabled={isSendingCode}
                      >
                        {isSendingCode ? t("profile.sending") : t("profile.verifyNow")}
                      </Button>
                    )}
                    {(user as any).emailVerified && (
                      <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        {t("profile.verified")}
                      </span>
                    )}
                  </FormLabel>
                  <FormControl>
                    <div className="flex flex-col gap-2">
                      <Input
                        {...field}
                        type="email"
                        placeholder="email@example.com"
                        data-testid="input-profile-email"
                        disabled={isVerifying}
                      />
                      {isVerifying && (
                        <div className="flex gap-2 animate-in slide-in-from-top-2">
                          <Input
                            placeholder={t("profile.enterCode")}
                            value={verificationCode}
                            onChange={(e) => setVerificationCode(e.target.value)}
                            className="flex-1"
                          />
                          <Button 
                            type="button" 
                            size="sm" 
                            onClick={onConfirmVerification}
                            disabled={isLoading || !verificationCode}
                          >
                            {t("profile.confirm")}
                          </Button>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setIsVerifying(false)}
                          >
                            {t("dialog.cancel")}
                          </Button>
                        </div>
                      )}
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
                data-testid="button-profile-save"
              >
                {isLoading ? t("profile.saving") : t("profile.save")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
