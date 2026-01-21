import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  MapPin, 
  Send, 
  Mic, 
  Smile, 
  AlertCircle, 
  Radio,
  Loader2,
  Clock,
  ShieldAlert,
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GifStickerPicker } from "@/components/chat/gif-sticker-picker";
import type { CommunityMessageWithSession } from "@shared/schema";

interface CommunitySession {
  sessionId: string;
  zoneId: string;
  zoneName: string;
  pseudonym: string;
  isUnder16: boolean;
  messageCount: number;
  silencedUntil?: string;
  expiresAt: string;
}

type CooldownType = 'text' | 'sticker' | 'gif';

const COOLDOWNS: Record<CooldownType, number> = {
  text: 9000,
  sticker: 24000,
  gif: 24000,
};

export default function CommunityPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [locationState, setLocationState] = useState<'requesting' | 'denied' | 'checking' | 'found' | 'not_found' | 'error'>('requesting');
  const [showAgeDialog, setShowAgeDialog] = useState(false);
  const [age, setAge] = useState("");
  const [session, setSession] = useState<CommunitySession | null>(null);
  const [messages, setMessages] = useState<CommunityMessageWithSession[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [cooldowns, setCooldowns] = useState<Record<CooldownType, number>>({ text: 0, sticker: 0, gif: 0 });
  const [resetTimer, setResetTimer] = useState<string>("");
  const [sessionToBlock, setSessionToBlock] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const locationCheckInterval = useRef<NodeJS.Timeout>();
  const messageRefreshInterval = useRef<NodeJS.Timeout>();
  const userLocation = useRef<{ lat: number; lng: number } | null>(null);

  const requestLocationAndEntry = useCallback(async (userAge: number) => {
    setLocationState('checking');
    
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });

      userLocation.current = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      const res = await apiRequest('POST', '/api/community/entry', {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        age: userAge,
      });

      const response = await res.json();
      if (response.sessionId) {
        setSession(response);
        setLocationState('found');
        loadMessages(response.zoneId, response.sessionId);
      }
    } catch (error: unknown) {
      const fetchError = error as { message?: string };
      if (fetchError.message?.includes('no_zone_nearby') || fetchError.message?.includes('404')) {
        setLocationState('not_found');
      } else if (error instanceof GeolocationPositionError) {
        setLocationState('denied');
      } else {
        setLocationState('error');
      }
    }
  }, []);

  const loadMessages = useCallback(async (zoneId: string, sessionId: string) => {
    try {
      const res = await fetch(`/api/community/messages/${zoneId}?sessionId=${sessionId}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setTimeout(() => {
          scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  }, []);

  const validateLocation = useCallback(async () => {
    if (!session || !userLocation.current) return;

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 30000
        });
      });

      userLocation.current = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      const res = await apiRequest('POST', '/api/community/validate-location', {
        sessionId: session.sessionId,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      const response = await res.json();
      if (!response.valid) {
        setSession(null);
        setLocationState('not_found');
        toast({
          title: t('community.leftZone'),
          description: t('community.leftZoneDesc'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Location validation error:', error);
    }
  }, [session, t, toast]);

  useEffect(() => {
    if (locationState === 'requesting') {
      if (!navigator.geolocation) {
        setLocationState('error');
        return;
      }
      
      // If user already has verified age, skip the dialog
      if (user?.ageVerified) {
        requestLocationAndEntry(user.ageVerified);
      } else {
        setShowAgeDialog(true);
      }
    }
  }, [locationState, user?.ageVerified, requestLocationAndEntry]);

  useEffect(() => {
    if (session) {
      locationCheckInterval.current = setInterval(validateLocation, 60000);
      messageRefreshInterval.current = setInterval(() => {
        loadMessages(session.zoneId, session.sessionId);
      }, 5000);
    }

    return () => {
      if (locationCheckInterval.current) clearInterval(locationCheckInterval.current);
      if (messageRefreshInterval.current) clearInterval(messageRefreshInterval.current);
    };
  }, [session, validateLocation, loadMessages]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCooldowns(prev => {
        const now = Date.now();
        return {
          text: Math.max(0, prev.text - 1000),
          sticker: Math.max(0, prev.sticker - 1000),
          gif: Math.max(0, prev.gif - 1000),
        };
      });

      if (session?.expiresAt) {
        const expires = new Date(session.expiresAt).getTime();
        const now = new Date().getTime();
        const diff = expires - now;
        
        if (diff <= 0) {
          setResetTimer("00:00:00");
        } else {
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          setResetTimer(
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
          );
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [session?.expiresAt]);

  const handleAgeSubmit = async () => {
    const userAge = parseInt(age);
    if (isNaN(userAge) || userAge < 13 || userAge > 120) {
      toast({
        title: t('community.invalidAge'),
        variant: 'destructive',
      });
      return;
    }
    
    // Save age verification to user profile
    try {
      await apiRequest('POST', '/api/auth/verify-age', { age: userAge });
      // Refresh user data to update ageVerified in session
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
    } catch (error) {
      console.error('Failed to save age verification:', error);
    }
    
    setShowAgeDialog(false);
    requestLocationAndEntry(userAge);
  };

  const sendMessage = async (contentType: CooldownType, content: string, duration?: number) => {
    if (!session) return;

    if (cooldowns[contentType] > 0) {
      toast({
        title: t('community.cooldown'),
        description: t('community.cooldownDesc', { seconds: Math.ceil(cooldowns[contentType] / 1000) }),
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiRequest('POST', '/api/community/messages', {
        sessionId: session.sessionId,
        contentType,
        content,
        duration,
      });

      if (res.status === 429) {
        const data = await res.json();
        setCooldowns(prev => ({
          ...prev,
          [contentType]: (data.waitSeconds || 5) * 1000
        }));
        toast({
          title: t('community.cooldown'),
          description: t('community.cooldownDesc', { seconds: data.waitSeconds || 5 }),
          variant: 'destructive',
        });
        return;
      }

      if (!res.ok) {
        const error = await res.json();
        if (error.message === "silenced") {
          toast({
            title: t('community.silenced'),
            description: t('community.silencedDesc'),
            variant: 'destructive',
          });
        }
        throw new Error(error.message || "Failed to send message");
      }

      const response = await res.json();
      if (response.success) {
        setCooldowns(prev => ({ ...prev, [contentType]: COOLDOWNS[contentType] }));
        loadMessages(session.zoneId, session.sessionId);
        setNewMessage('');
      }
    } catch (error: unknown) {
      const fetchError = error as { message?: string };
      if (fetchError.message?.includes('content_blocked')) {
        toast({
          title: t('community.contentBlocked'),
          description: t('community.contentBlockedDesc'),
          variant: 'destructive',
        });
      } else if (fetchError.message?.includes('rate_limited')) {
        const waitMatch = fetchError.message?.match(/(\d+)/);
        const waitSeconds = waitMatch ? parseInt(waitMatch[1]) : 10;
        setCooldowns(prev => ({ ...prev, [contentType]: waitSeconds * 1000 }));
      } else if (fetchError.message?.includes('silenced')) {
        toast({
          title: t('community.silenced'),
          description: t('community.silencedDesc'),
          variant: 'destructive',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendText = () => {
    if (!newMessage.trim()) return;
    sendMessage('text', newMessage.trim());
  };

  const handleStickerGifSelect = (url: string, type: 'sticker' | 'gif') => {
    sendMessage(type, url);
    setShowPicker(false);
  };

  const handleBlockSession = async (targetSessionId: string) => {
    try {
      const res = await apiRequest('POST', `/api/community/sessions/${targetSessionId}/block`, {});
      if (res.ok) {
        toast({
          title: t('community.userBlocked'),
          description: t('community.userBlockedDesc'),
        });
      }
    } catch (error) {
      console.error('Failed to block user:', error);
      toast({
        title: t('error.title'),
        description: t('error.generic'),
        variant: 'destructive',
      });
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      const res = await apiRequest('DELETE', `/api/community/messages/${messageId}`, {});
      if (res.ok) {
        toast({
          title: t('community.messageDeleted'),
        });
        if (session) {
          loadMessages(session.zoneId, session.sessionId);
        }
      }
    } catch (error) {
      console.error('Failed to delete message:', error);
      toast({
        title: t('error.title'),
        description: t('error.generic'),
        variant: 'destructive',
      });
    }
  };

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = async () => {
    // Audio recording disabled
    return;
  };

  const stopRecording = () => {
    // Audio recording disabled
    return;
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!user) return null;

  if (locationState === 'requesting' || locationState === 'checking') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center pb-20">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <h2 className="text-xl font-semibold mb-2">{t('community.checkingLocation')}</h2>
        <p className="text-muted-foreground">{t('community.checkingLocationDesc')}</p>

        <Dialog open={showAgeDialog} onOpenChange={setShowAgeDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('community.ageVerification')}</DialogTitle>
              <DialogDescription>
                {t('community.ageVerificationDesc')}
              </DialogDescription>
            </DialogHeader>
            <Input
              type="number"
              placeholder={t('community.enterAge')}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              min={13}
              max={120}
              data-testid="input-age"
            />
            <DialogFooter>
              <Button onClick={handleAgeSubmit} data-testid="button-confirm-age">
                {t('common.confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (locationState === 'denied') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center pb-20">
        <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">{t('community.locationDenied')}</h2>
        <p className="text-muted-foreground mb-4">{t('community.locationDeniedDesc')}</p>
        <Button onClick={() => setLocationState('requesting')} data-testid="button-retry-location">
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  if (locationState === 'not_found') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center pb-20">
        <Radio className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">{t('community.noZone')}</h2>
        <p className="text-muted-foreground mb-4">{t('community.noZoneDesc')}</p>
        <Button variant="outline" onClick={() => setLocationState('requesting')} data-testid="button-check-again">
          {t('community.checkAgain')}
        </Button>
      </div>
    );
  }

  if (locationState === 'error') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center pb-20">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">{t('community.error')}</h2>
        <p className="text-muted-foreground">{t('community.errorDesc')}</p>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="flex-1 flex flex-col h-full pb-14">
      <div className="p-3 border-b bg-card/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="font-medium">{session.zoneName}</span>
        </div>
        <div className="flex flex-col items-end gap-1 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{t('community.messagesRemaining', { count: 100 - session.messageCount })}</span>
          </div>
          <div className="flex items-center gap-1 bg-muted/50 px-1.5 py-0.5 rounded-full font-mono">
            <Trash2 className="h-2.5 w-2.5" />
            <span>{resetTimer || "00:00:00"}</span>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {messages.map((msg) => {
            const isOwn = msg.session.pseudonym === session.pseudonym;
            const isModerator = ['KlkCEO', 'mysticFoxyy'].includes(user.username);
            
            return (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col max-w-[80%]",
                  isOwn ? "ml-auto items-end" : "items-start"
                )}
              >
                <div className="flex items-center gap-2 mb-1 group">
                  {!isOwn && (
                    <span className="text-xs text-muted-foreground">
                      {msg.session.pseudonym}
                    </span>
                  )}
                  <div className="flex items-center gap-1">
                    {!isOwn && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => setSessionToBlock(msg.sessionId)}
                        title={t('community.block')}
                      >
                        <ShieldAlert className="h-4 w-4" />
                      </Button>
                    )}
                    {isModerator && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteMessage(msg.id)}
                        title={t('common.delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div
                  className={cn(
                    "rounded-2xl px-3 py-2 shadow-sm border",
                    isOwn 
                      ? "bg-muted border-border rounded-tr-none" 
                      : "bg-muted border-border rounded-tl-none"
                  )}
                >
                  {msg.contentType === 'text' && (
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                  )}
                  {(msg.contentType === 'sticker' || msg.contentType === 'gif') && (
                    <div className="relative">
                      <img 
                        src={msg.fileUrl || msg.content || ''} 
                        alt={msg.contentType} 
                        className="max-w-[140px] max-h-[140px] rounded object-contain"
                      />
                    </div>
                  )}
                  {msg.contentType === 'audio' && (
                    <div className="flex items-center gap-2 p-1 min-w-[220px]">
                      <div className={cn(
                        "p-2 rounded-full",
                        isOwn ? "bg-primary-foreground/10 text-primary-foreground" : "bg-background text-muted-foreground"
                      )}>
                        <Mic className="h-4 w-4 opacity-70" />
                      </div>
                      <div className="flex-1">
                        <audio controls className={cn(
                          "h-8 w-full filter grayscale contrast-125",
                          isOwn ? "invert brightness-200" : "dark:invert"
                        )}>
                          <source src={msg.fileUrl || ''} type="audio/webm" />
                        </audio>
                      </div>
                      {msg.duration && (
                        <span className="text-[10px] opacity-70 font-mono">
                          {Math.floor(msg.duration / 60)}:{(msg.duration % 60).toString().padStart(2, '0')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-xs text-muted-foreground mt-1">
                  {formatTime(msg.createdAt as unknown as string)}
                </span>
              </div>
            );
          })}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {showPicker && (
        <GifStickerPicker
          onSelect={handleStickerGifSelect}
          onClose={() => setShowPicker(false)}
        />
      )}

      <div className="p-3 border-t bg-background">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowPicker(!showPicker)}
              disabled={(cooldowns.sticker > 0 && cooldowns.gif > 0) || isLoading}
              data-testid="button-sticker-picker"
            >
              <Smile className="h-5 w-5" />
            </Button>
            {(cooldowns.sticker > 0 || cooldowns.gif > 0) && (
              <div className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center pointer-events-none animate-in fade-in zoom-in">
                {Math.ceil(Math.max(cooldowns.sticker, cooldowns.gif) / 1000)}
              </div>
            )}
          </div>
          
          <div className="flex-1 relative">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={t('community.typeMessage')}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendText()}
              disabled={isLoading || (cooldowns.text > 0 && !newMessage.trim())}
              className={cn(cooldowns.text > 0 && "opacity-80")}
              data-testid="input-community-message"
            />
            {cooldowns.text > 0 && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground bg-background/80 px-1 rounded">
                {Math.ceil(cooldowns.text / 1000)}s
              </div>
            )}
          </div>

          {newMessage.trim() ? (
            <Button
              size="icon"
              onClick={handleSendText}
              disabled={isLoading || cooldowns.text > 0}
              data-testid="button-send-community"
            >
              {cooldowns.text > 0 ? (
                <span className="text-xs">{Math.ceil(cooldowns.text / 1000)}</span>
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          ) : null}
        </div>
      </div>

      <AlertDialog open={!!sessionToBlock} onOpenChange={(open) => !open && setSessionToBlock(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('chat.blockUserTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('community.blockConfirmDesc') || "¿Estás seguro de que quieres reportar a este usuario? Esto contribuirá a su silencio automático."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (sessionToBlock) {
                  handleBlockSession(sessionToBlock);
                  setSessionToBlock(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('chat.blockUserTitle')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
