import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, Plus, Trash2, Image as ImageIcon } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { CustomSticker } from "@shared/schema";

interface GifStickerPickerProps {
  onSelect: (url: string, type: "gif" | "sticker") => void;
  onClose: () => void;
}

interface GiphyGif {
  id: string;
  images: {
    fixed_height: {
      url: string;
      width: string;
      height: string;
    };
    original: {
      url: string;
    };
  };
}

export function GifStickerPicker({ onSelect, onClose }: GifStickerPickerProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"gif" | "sticker">("gif");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value);
    }, 500);
  };

  const { data: gifs, isLoading: gifsLoading } = useQuery<GiphyGif[]>({
    queryKey: ["gifs", debouncedQuery],
    queryFn: async () => {
      const endpoint = debouncedQuery
        ? `/api/giphy/search?q=${encodeURIComponent(debouncedQuery)}`
        : `/api/giphy/search`;
      const res = await fetch(endpoint, { credentials: "include" });
      const data = await res.json();
      return data.data || [];
    },
    enabled: activeTab === "gif",
  });

  const { data: stickers, isLoading: stickersLoading } = useQuery<CustomSticker[]>({
    queryKey: ["/api/stickers"],
    enabled: activeTab === "sticker",
  });

  const addStickerMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("sticker", file);
      const res = await fetch("/api/stickers", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to add sticker");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stickers"] });
    },
  });

  const deleteStickerMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/stickers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stickers"] });
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      addStickerMutation.mutate(file);
    }
    e.target.value = "";
  };

  const handleGifSelect = (gif: GiphyGif) => {
    onSelect(gif.images.original.url, "gif");
    onClose();
  };

  const handleStickerSelect = (sticker: CustomSticker) => {
    onSelect(sticker.imageUrl, "sticker");
    onClose();
  };

  return (
    <div className="w-full bg-background border rounded-lg shadow-lg" data-testid="gif-sticker-picker">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "gif" | "sticker")}>
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="gif" data-testid="tab-gif">GIFs</TabsTrigger>
          <TabsTrigger value="sticker" data-testid="tab-sticker">Stickers</TabsTrigger>
        </TabsList>

        <div className="p-2">
          {activeTab === "gif" && (
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("chat.searchGifs") || "Search GIFs..."}
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-8"
                data-testid="input-gif-search"
              />
            </div>
          )}

          {activeTab === "sticker" && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={addStickerMutation.isPending}
                className="flex-1"
                data-testid="button-add-sticker"
              >
                {addStickerMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                {t("chat.addSticker") || "Add Sticker"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          )}
        </div>

        <TabsContent value="gif" className="mt-0">
          <ScrollArea className="h-[250px] p-2">
            {gifsLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : gifs && gifs.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {gifs.map((gif) => (
                  <button
                    key={gif.id}
                    onClick={() => handleGifSelect(gif)}
                    className="relative overflow-hidden rounded-md hover-elevate active-elevate-2 cursor-pointer"
                    data-testid={`gif-item-${gif.id}`}
                  >
                    <img
                      src={gif.images.fixed_height.url}
                      alt="GIF"
                      className="w-full h-auto object-cover"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <ImageIcon className="h-8 w-8 mb-2" />
                <p className="text-sm">{t("chat.noGifsFound") || "No GIFs found"}</p>
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="sticker" className="mt-0">
          <ScrollArea className="h-[250px] p-2">
            {stickersLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : stickers && stickers.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {stickers.map((sticker) => (
                  <div
                    key={sticker.id}
                    className="relative group"
                    data-testid={`sticker-item-${sticker.id}`}
                  >
                    <button
                      onClick={() => handleStickerSelect(sticker)}
                      className="w-full aspect-square overflow-hidden rounded-md hover-elevate active-elevate-2 cursor-pointer bg-muted/50"
                    >
                      <img
                        src={sticker.imageUrl}
                        alt={sticker.name || "Sticker"}
                        className="w-full h-full object-contain p-1"
                        loading="lazy"
                      />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteStickerMutation.mutate(sticker.id);
                      }}
                      className="absolute -top-1 -right-1 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      data-testid={`button-delete-sticker-${sticker.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <ImageIcon className="h-8 w-8 mb-2" />
                <p className="text-sm text-center">
                  {t("chat.noStickers") || "No stickers yet. Add your own!"}
                </p>
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
