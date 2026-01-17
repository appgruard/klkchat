import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function LanguageToggle() {
  const { i18n, t } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" data-testid="button-language-toggle">
          <Globe className="h-5 w-5" />
          <span className="sr-only">{t("language.language")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => changeLanguage("en")}
          className={i18n.language === "en" ? "bg-accent" : ""}
          data-testid="menu-item-english"
        >
          {t("language.english")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => changeLanguage("es")}
          className={i18n.language.startsWith("es") ? "bg-accent" : ""}
          data-testid="menu-item-spanish"
        >
          {t("language.spanish")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
