import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, Plus, Trash2, Image as ImageIcon, Link, Package, ChevronDown } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
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

const DEFAULT_STICKERS = [
  { id: "default-1", url: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f44d/512.gif", name: "thumbs-up" },
  { id: "default-2", url: "https://fonts.gstatic.com/s/e/notoemoji/latest/2764_fe0f/512.gif", name: "heart" },
  { id: "default-3", url: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f602/512.gif", name: "joy" },
  { id: "default-4", url: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f60d/512.gif", name: "heart-eyes" },
  { id: "default-5", url: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/512.gif", name: "fire" },
  { id: "default-6", url: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f389/512.gif", name: "party" },
  { id: "default-7", url: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f44b/512.gif", name: "wave" },
  { id: "default-8", url: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f60e/512.gif", name: "cool" },
  { id: "default-9", url: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f62d/512.gif", name: "crying" },
  { id: "default-10", url: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f914/512.gif", name: "thinking" },
  { id: "default-11", url: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f917/512.gif", name: "hug" },
  { id: "default-12", url: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f44f/512.gif", name: "clap" },
];

// Popular default GIFs as fallback when GIPHY API is unavailable
const DEFAULT_GIFS: GiphyGif[] = [
  { id: "fallback-1", images: { fixed_height: { url: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/200.gif", width: "356", height: "200" }, original: { url: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif" } } },
  { id: "fallback-2", images: { fixed_height: { url: "https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/200.gif", width: "356", height: "200" }, original: { url: "https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif" } } },
  { id: "fallback-3", images: { fixed_height: { url: "https://media.giphy.com/media/l4FGuhL4U2WyjdkaY/200.gif", width: "270", height: "200" }, original: { url: "https://media.giphy.com/media/l4FGuhL4U2WyjdkaY/giphy.gif" } } },
  { id: "fallback-4", images: { fixed_height: { url: "https://media.giphy.com/media/3o7TKU8RvQuomFfUUU/200.gif", width: "360", height: "200" }, original: { url: "https://media.giphy.com/media/3o7TKU8RvQuomFfUUU/giphy.gif" } } },
  { id: "fallback-5", images: { fixed_height: { url: "https://media.giphy.com/media/l0HlvtIPzPdt2usKs/200.gif", width: "356", height: "200" }, original: { url: "https://media.giphy.com/media/l0HlvtIPzPdt2usKs/giphy.gif" } } },
  { id: "fallback-6", images: { fixed_height: { url: "https://media.giphy.com/media/3ohzdIuqJoo8QdKlnW/200.gif", width: "480", height: "200" }, original: { url: "https://media.giphy.com/media/3ohzdIuqJoo8QdKlnW/giphy.gif" } } },
  { id: "fallback-7", images: { fixed_height: { url: "https://media.giphy.com/media/l0MYGb1LuZ3n7dRnO/200.gif", width: "267", height: "200" }, original: { url: "https://media.giphy.com/media/l0MYGb1LuZ3n7dRnO/giphy.gif" } } },
  { id: "fallback-8", images: { fixed_height: { url: "https://media.giphy.com/media/xT0GqssRweIhlz209i/200.gif", width: "400", height: "200" }, original: { url: "https://media.giphy.com/media/xT0GqssRweIhlz209i/giphy.gif" } } },
];

export function GifStickerPicker({ onSelect, onClose }: GifStickerPickerProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"gif" | "sticker">("gif");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showUrlDialog, setShowUrlDialog] = useState(false);
  const [stickerUrl, setStickerUrl] = useState("");
  const [stickerName, setStickerName] = useState("");
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();
  const touchStartRef = useRef<{ y: number; time: number } | null>(null);

  // Swipe down to close gesture - works on entire picker
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only start drag if not scrolling inside ScrollArea
    const target = e.target as HTMLElement;
    const isScrollable = target.closest('[data-radix-scroll-area-viewport]');
    if (isScrollable) {
      const scrollArea = isScrollable as HTMLElement;
      // Allow swipe only if at scroll top or if dragging header/TabsList
      if (scrollArea.scrollTop > 5) return;
    }
    touchStartRef.current = { 
      y: e.touches[0].clientY, 
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      time: Date.now() 
    };
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const deltaY = e.touches[0].clientY - touchStartRef.current.y;
    const deltaX = Math.abs(e.touches[0].clientX - (touchStartRef.current as any).startX || 0);
    const totalDeltaY = Math.abs(e.touches[0].clientY - (touchStartRef.current as any).startY || 0);
    
    // Improved vertical vs horizontal detection
    // If it's a clear downward swipe (deltaY > 0) and more vertical than horizontal
    if (deltaY > 10 && deltaY > deltaX) {
      setDragY(Math.min(deltaY, 300));
      // Critically important: prevent default only if we are clearly swiping down
      // to avoid triggering browser refresh on some mobile browsers
      if (e.cancelable) e.preventDefault();
    } else if (deltaY < -20 || (deltaX > 20 && deltaX > totalDeltaY)) {
      // User is scrolling up or swiping horizontally, cancel drag
      setIsDragging(false);
      touchStartRef.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchStartRef.current) {
      setDragY(0);
      setIsDragging(false);
      return;
    }
    const duration = Date.now() - touchStartRef.current.time;
    const velocity = dragY / duration;
    
    // Close if dragged more than 80px or fast swipe down
    if (dragY > 80 || (velocity > 0.5 && dragY > 20)) {
      onClose();
    }
    
    setDragY(0);
    setIsDragging(false);
    touchStartRef.current = null;
  }, [dragY, onClose]);

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

  const addStickerByUrlMutation = useMutation({
    mutationFn: async ({ url, name }: { url: string; name: string }) => {
      const res = await apiRequest("POST", "/api/stickers/url", { url, name });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stickers"] });
      setShowUrlDialog(false);
      setStickerUrl("");
      setStickerName("");
      toast({
        title: t("chat.stickerAdded") || "Sticker added",
        description: t("chat.stickerAddedDesc") || "The sticker has been added to your collection",
      });
    },
    onError: () => {
      toast({
        title: t("error.title") || "Error",
        description: t("chat.stickerAddFailed") || "Failed to add sticker. Please check the URL.",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      addStickerMutation.mutate(file);
    }
    e.target.value = "";
  };

  const handleAddStickerByUrl = () => {
    if (!stickerUrl.trim()) return;
    addStickerByUrlMutation.mutate({ 
      url: stickerUrl.trim(), 
      name: stickerName.trim() || "Custom Sticker" 
    });
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
    <div 
      className="w-full bg-background border rounded-t-xl shadow-lg overflow-hidden"
      style={{
        transform: `translateY(${dragY}px)`,
        opacity: isDragging ? Math.max(0.5, 1 - dragY / 200) : 1,
        transition: isDragging ? 'none' : 'transform 0.2s ease-out, opacity 0.2s ease-out'
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      data-testid="gif-sticker-picker"
    >
      {/* Drag handle indicator */}
      <div className="flex justify-center py-2 cursor-grab active:cursor-grabbing">
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
          <ChevronDown className="h-3 w-3 text-muted-foreground/40" />
        </div>
      </div>
      
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
                {t("chat.addSticker") || "Add"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUrlDialog(true)}
                className="flex-1"
                data-testid="button-add-sticker-url"
              >
                <Link className="h-4 w-4 mr-2" />
                {t("chat.importUrl") || "URL"}
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
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {/* Show API results if available, otherwise show default GIFs */}
                {(gifs && gifs.length > 0 ? gifs : (!debouncedQuery ? DEFAULT_GIFS : [])).map((gif) => (
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
                {(!gifs || gifs.length === 0) && debouncedQuery && (
                  <div className="col-span-2 flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <ImageIcon className="h-8 w-8 mb-2" />
                    <p className="text-sm">{t("chat.noGifsFound") || "No GIFs found"}</p>
                  </div>
                )}
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
            ) : (
              <div className="space-y-4">
                {stickers && stickers.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 font-medium">{t("chat.myStickers") || "My Stickers"}</p>
                    <div className="grid grid-cols-4 gap-2">
                      {stickers.map((sticker) => (
                        <div
                          key={sticker.id}
                          className="relative group"
                          data-testid={`sticker-item-${sticker.id}`}
                        >
                          <button
                            onClick={() => handleStickerSelect(sticker)}
                            className="w-full aspect-square max-w-[70px] max-h-[70px] rounded-md cursor-pointer bg-muted/50 hover:bg-muted transition-colors mx-auto"
                          >
                            <img
                              src={sticker.imageUrl}
                              alt={sticker.name || "Sticker"}
                              className="w-full h-full object-contain p-1"
                              style={{ maxWidth: '70px', maxHeight: '70px' }}
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
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-2 font-medium">{t("chat.defaultStickers") || "Default Stickers"}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {DEFAULT_STICKERS.map((sticker) => (
                      <button
                        key={sticker.id}
                        onClick={() => onSelect(sticker.url, "sticker")}
                        className="w-full aspect-square max-w-[70px] max-h-[70px] rounded-md cursor-pointer bg-muted/50 hover:bg-muted transition-colors mx-auto"
                        data-testid={`sticker-default-${sticker.id}`}
                      >
                        <img
                          src={sticker.url}
                          alt={sticker.name}
                          className="w-full h-full object-contain p-1"
                          style={{ maxWidth: '70px', maxHeight: '70px' }}
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Dialog for adding sticker by URL */}
      <Dialog open={showUrlDialog} onOpenChange={setShowUrlDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("chat.importStickerUrl") || "Import Sticker from URL"}</DialogTitle>
            <DialogDescription>
              {t("chat.importStickerUrlDesc") || "Paste the URL of an image to add it as a sticker. Supports PNG, GIF, and WebP formats."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sticker-url">{t("chat.stickerUrl") || "Image URL"}</Label>
              <Input
                id="sticker-url"
                placeholder="https://example.com/sticker.png"
                value={stickerUrl}
                onChange={(e) => setStickerUrl(e.target.value)}
                data-testid="input-sticker-url"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sticker-name">{t("chat.stickerName") || "Name (optional)"}</Label>
              <Input
                id="sticker-name"
                placeholder={t("chat.stickerNamePlaceholder") || "My sticker"}
                value={stickerName}
                onChange={(e) => setStickerName(e.target.value)}
                data-testid="input-sticker-name"
              />
            </div>
            {stickerUrl && (
              <div className="flex justify-center p-4 bg-muted rounded-lg">
                <img 
                  src={stickerUrl} 
                  alt="Preview" 
                  className="max-w-[120px] max-h-[120px] object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUrlDialog(false)}>
              {t("common.cancel") || "Cancel"}
            </Button>
            <Button 
              onClick={handleAddStickerByUrl}
              disabled={!stickerUrl.trim() || addStickerByUrlMutation.isPending}
              data-testid="button-confirm-add-sticker-url"
            >
              {addStickerByUrlMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Package className="h-4 w-4 mr-2" />
              )}
              {t("chat.addSticker") || "Add Sticker"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
