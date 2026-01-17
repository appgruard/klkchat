import { useTranslation } from "react-i18next";
import { Settings, Moon, Sun, Globe } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/components/theme-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LANGUAGES = [
  { code: "en", labelKey: "language.english" },
  { code: "es", labelKey: "language.spanish" },
  { code: "fr", labelKey: "language.french" },
  { code: "de", labelKey: "language.german" },
  { code: "ru", labelKey: "language.russian" },
  { code: "zh", labelKey: "language.chinese" },
  { code: "ja", labelKey: "language.japanese" },
];

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();

  const handleLanguageChange = (newLang: string) => {
    i18n.changeLanguage(newLang);
    localStorage.setItem("i18nextLng", newLang);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {t("settings.title")}
          </DialogTitle>
          <DialogDescription>
            {t("settings.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {theme === "dark" ? (
                <Moon className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Sun className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <Label className="text-base">{t("settings.theme")}</Label>
                <p className="text-sm text-muted-foreground">
                  {theme === "dark" ? t("settings.darkMode") : t("settings.lightMode")}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              data-testid="button-toggle-theme"
            >
              {theme === "dark" ? t("settings.lightMode") : t("settings.darkMode")}
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label className="text-base">{t("language.language")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t(LANGUAGES.find(l => l.code === (i18n.language.split('-')[0]))?.labelKey || "language.spanish")}
                </p>
              </div>
            </div>
            <Select
              value={i18n.language.split('-')[0]}
              onValueChange={handleLanguageChange}
            >
              <SelectTrigger className="w-[140px]" data-testid="select-language">
                <SelectValue placeholder={t("language.language")} />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {t(lang.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-settings-close"
          >
            {t("dialog.close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
