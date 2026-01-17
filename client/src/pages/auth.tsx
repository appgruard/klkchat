import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Lock, User, Eye, EyeOff, MessageCircle, Shield, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { apiRequest } from "@/lib/queryClient";
import logoPath from "@assets/generated_images/klk!_favicon_icon.png";

const loginSchema = z.object({
  username: z.string().min(3, "validation.usernameMin"),
  password: z.string().min(6, "validation.passwordMin"),
});

const registerSchema = z.object({
  username: z.string()
    .min(3, "validation.usernameMin")
    .max(30, "validation.usernameMax")
    .regex(/^[a-zA-Z0-9_]+$/, "validation.usernameChars"),
  password: z.string().min(6, "validation.passwordMin"),
  confirmPassword: z.string(),
  displayName: z.string().min(1, "validation.displayNameRequired").max(50),
}).refine((data) => data.password === data.confirmPassword, {
  message: "validation.passwordsMatch",
  path: ["confirmPassword"],
});

type LoginFormData = z.infer<typeof loginSchema>;
type RegisterFormData = z.infer<typeof registerSchema>;

export default function AuthPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login, register, registerAnonymous } = useAuth();
  const { toast } = useToast();

  const forgotSchema = z.object({
    email: z.string().email("validation.invalidEmail"),
  });

  const forgotForm = useForm<{ email: string }>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const registerForm = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: "", password: "", confirmPassword: "", displayName: "" },
  });

  const onLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      await login(data.username, data.password);
      toast({ title: t("auth.welcomeBack"), description: t("auth.successfulLogin") });
    } catch (error: unknown) {
      toast({
        title: t("auth.loginFailed"),
        description: error instanceof Error ? error.message : t("auth.invalidCredentials"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onRegister = async (data: RegisterFormData) => {
    setIsLoading(true);
    try {
      await register(data.username, data.password, data.displayName);
      toast({ title: t("auth.accountCreated"), description: t("auth.welcomeToApp") });
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

  const onAnonymousLogin = async () => {
    setIsLoading(true);
    try {
      await registerAnonymous();
      toast({
        title: t("auth.anonymousStarted"),
        description: t("auth.anonymousWarning"),
      });
    } catch (error: unknown) {
      toast({
        title: t("auth.anonymousFailed"),
        description: error instanceof Error ? error.message : t("auth.pleaseRetry"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onForgotPassword = async (data: { email: string }) => {
    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/auth/forgot-password", data);
      toast({
        title: t("profile.codeSent"),
        description: t("profile.codeSentDesc"),
      });
      setMode("login");
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

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="flex items-center justify-end gap-2 p-4">
        <LanguageToggle />
        <ThemeToggle />
      </header>
      
      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-card flex items-center justify-center overflow-hidden border border-border">
                <img 
                  src={logoPath} 
                  alt={t("app.name")} 
                  className="w-14 h-14 object-contain"
                />
              </div>
            </div>
            <div>
              <CardTitle className="text-2xl font-semibold">{t("app.name")}</CardTitle>
              <CardDescription className="mt-2">
                {mode === "login" ? t("auth.signInToContinue") : mode === "register" ? t("auth.createYourAccount") : "Recuperar contraseña"}
              </CardDescription>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {mode === "login" ? (
              <Form {...loginForm} key="login-form">
                <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                  <FormField
                    control={loginForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("form.username")}</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              {...field}
                              placeholder={t("form.enterUsername")}
                              className="pl-10"
                              data-testid="input-username"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>{t("form.password")}</FormLabel>
                          <Button
                            type="button"
                            variant="link"
                            className="px-0 h-auto text-xs"
                            onClick={() => setMode("forgot")}
                          >
                            ¿Olvidaste tu contraseña?
                          </Button>
                        </div>
                        <FormControl>
                          <div className="relative flex items-center">
                            <Lock className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                            <Input
                              {...field}
                              type={showPassword ? "text" : "password"}
                              placeholder={t("form.enterPassword")}
                              className="pl-10 pr-10"
                              data-testid="input-password"
                            />
                            <button
                              type="button"
                              className="absolute right-3 text-muted-foreground hover:text-foreground"
                              onClick={() => setShowPassword(!showPassword)}
                              data-testid="button-toggle-password"
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

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                    data-testid="button-login"
                  >
                    {isLoading ? t("auth.signingIn") : t("auth.signIn")}
                  </Button>
                </form>
              </Form>
            ) : mode === "register" ? (
              <Form {...registerForm} key="register-form">
                <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4">
                  <FormField
                    control={registerForm.control}
                    name="displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("form.displayName")}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={t("form.howToCallYou")}
                            data-testid="input-display-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={registerForm.control}
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
                              data-testid="input-register-username"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={registerForm.control}
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
                              data-testid="input-register-password"
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
                    control={registerForm.control}
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
                              data-testid="input-confirm-password"
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
                    disabled={isLoading}
                    data-testid="button-register"
                  >
                    {isLoading ? t("auth.creatingAccount") : t("auth.createAccount")}
                  </Button>
                </form>
              </Form>
            ) : (
              <Form {...forgotForm} key="forgot-form">
                <form onSubmit={forgotForm.handleSubmit(onForgotPassword)} className="space-y-4">
                  <FormField
                    control={forgotForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("form.email")}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="email"
                            placeholder="email@example.com"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? t("profile.sending") : "Enviar código de recuperación"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => setMode("login")}
                  >
                    Volver al inicio de sesión
                  </Button>
                </form>
              </Form>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">{t("auth.or")}</span>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={onAnonymousLogin}
              disabled={isLoading}
              data-testid="button-anonymous"
            >
              <UserPlus className="h-4 w-4" />
              {t("auth.continueAnonymously")}
            </Button>

            <div className="text-center">
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  loginForm.reset();
                  registerForm.reset();
                }}
                data-testid="button-switch-mode"
              >
                {mode === "login" ? t("auth.noAccount") : t("auth.hasAccount")}
              </Button>
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Shield className="h-3 w-3" />
              <span>{t("app.e2eEncrypted")}</span>
            </div>
          </CardContent>
        </Card>
      </main>
      
      <footer className="p-4 text-center">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <MessageCircle className="h-4 w-4" />
          <span>{t("app.tagline")}</span>
        </div>
      </footer>
    </div>
  );
}
