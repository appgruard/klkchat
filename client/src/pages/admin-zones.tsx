import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapContainer, TileLayer, Marker, useMapEvents, Circle } from "react-leaflet";
import { Icon, LatLng } from "leaflet";
import { Plus, MapPin, Trash2, Radio, Loader2, Search } from "lucide-react";
import type { CommunityZone } from "@shared/schema";
import "leaflet/dist/leaflet.css";

const defaultIcon = new Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function LocationPicker({ position, onPositionChange }: { 
  position: { lat: number; lng: number } | null;
  onPositionChange: (pos: { lat: number; lng: number }) => void;
}) {
  useMapEvents({
    click(e) {
      onPositionChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });

  return position ? <Marker position={[position.lat, position.lng]} icon={defaultIcon} /> : null;
}

export default function AdminZonesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingZone, setEditingZone] = useState<CommunityZone | null>(null);
  const [zoneName, setZoneName] = useState("");
  const [zoneRadius, setZoneRadius] = useState("100");
  const [zoneType, setZoneType] = useState<string>("neighborhood");
  const [selectedPosition, setSelectedPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([18.4861, -69.9312]);

  const cities = [
    { name: "Santo Domingo, DO", lat: 18.4861, lng: -69.9312 },
    { name: "Santiago, DO", lat: 19.4517, lng: -70.6970 },
    { name: "Moca, DO", lat: 19.3941, lng: -70.5250 },
    { name: "Sosúa, DO", lat: 19.7525, lng: -70.5186 },
    { name: "Bogotá, CO", lat: 4.7110, lng: -74.0721 },
    { name: "Medellín, CO", lat: 6.2442, lng: -75.5812 },
    { name: "Buenos Aires, AR", lat: -34.6037, lng: -58.3816 },
    { name: "Córdoba, AR", lat: -31.4167, lng: -64.1833 },
    { name: "Caracas, VE", lat: 10.4806, lng: -66.9036 },
    { name: "Ciudad de Panamá, PA", lat: 8.9824, lng: -79.5199 },
    { name: "Santiago, CL", lat: -33.4489, lng: -70.6693 },
    { name: "Quito, EC", lat: -0.1807, lng: -78.4678 },
    { name: "Guayaquil, EC", lat: -2.1708, lng: -79.9224 },
    { name: "San Salvador, SV", lat: 13.6929, lng: -89.2182 },
    { name: "Montevideo, UY", lat: -34.9011, lng: -56.1645 },
    { name: "New York, US", lat: 40.7128, lng: -74.0060 },
    { name: "Miami, US", lat: 25.7617, lng: -80.1918 },
    { name: "Los Angeles, US", lat: 34.0522, lng: -118.2437 },
    { name: "Madrid, ES", lat: 40.4168, lng: -3.7038 },
    { name: "San Juan, PR", lat: 18.4655, lng: -66.1057 },
  ];

  const handleCitySelect = (cityName: string) => {
    const city = cities.find(c => c.name === cityName);
    if (city) {
      setMapCenter([city.lat, city.lng]);
    }
  };

  const { data: zones, isLoading } = useQuery<CommunityZone[]>({
    queryKey: ["/api/admin/zones"],
    enabled: user?.isAdmin === true,
  });

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setMapCenter([pos.coords.latitude, pos.coords.longitude]);
        },
        () => {}
      );
    }
  }, []);

  const handleDiscoverZones = async () => {
    setIsDiscovering(true);
    try {
      const response = await apiRequest("POST", "/api/admin/zones/discover", {
        lat: mapCenter[0],
        lng: mapCenter[1],
      });
      const data = await response.json();
      
      queryClient.invalidateQueries({ queryKey: ["/api/admin/zones"] });
      
      toast({
        title: t("admin.success"),
        description: data.message,
      });
    } catch (error) {
      toast({
        title: t("admin.error"),
        description: "Failed to discover nearby zones",
        variant: "destructive",
      });
    } finally {
      setIsDiscovering(false);
    }
  };

  if (!user?.isAdmin && user?.username !== 'KlkCEO' && user?.username !== 'mysticFoxyy') {
    return (
      <div className="h-full flex items-center justify-center pb-14">
        <p className="text-muted-foreground">{t("common.accessDenied")}</p>
      </div>
    );
  }

  const handleEditZone = (zone: CommunityZone) => {
    setEditingZone(zone);
    setZoneName(zone.name);
    setZoneRadius(zone.radiusMeters.toString());
    setZoneType(zone.zoneType);
    setSelectedPosition({ lat: zone.centerLat, lng: zone.centerLng });
    setShowCreateDialog(true);
  };

  const handleCreateZone = async () => {
    if (!zoneName.trim() || !selectedPosition) {
      toast({
        title: t("admin.error"),
        description: t("admin.fillAllFields"),
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      if (editingZone) {
        await apiRequest("PATCH", `/api/admin/zones/${editingZone.id}`, {
          name: zoneName.trim(),
          centerLat: selectedPosition.lat,
          centerLng: selectedPosition.lng,
          radiusMeters: parseInt(zoneRadius),
          zoneType,
        });
      } else {
        await apiRequest("POST", "/api/admin/zones", {
          name: zoneName.trim(),
          centerLat: selectedPosition.lat,
          centerLng: selectedPosition.lng,
          radiusMeters: parseInt(zoneRadius),
          zoneType,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/admin/zones"] });
      setShowCreateDialog(false);
      resetForm();

      toast({
        title: t("admin.success"),
        description: editingZone ? "Zona actualizada" : t("admin.zoneCreated"),
      });
    } catch (error) {
      toast({
        title: t("admin.error"),
        description: t("admin.createError"),
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setEditingZone(null);
    setZoneName("");
    setZoneRadius("100");
    setZoneType("neighborhood");
    setSelectedPosition(null);
  };

  const handleDeleteZone = async (zoneId: string) => {
    try {
      await apiRequest("DELETE", `/api/admin/zones/${zoneId}`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/zones"] });
      toast({
        title: t("admin.success"),
        description: t("admin.zoneDeleted"),
      });
    } catch (error) {
      toast({
        title: t("admin.error"),
        description: t("admin.deleteError"),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="h-full flex flex-col pb-14">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">{t("admin.zoneManagement")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Select onValueChange={handleCitySelect}>
            <SelectTrigger className="w-[150px] h-8">
              <SelectValue placeholder="Ir a ciudad..." />
            </SelectTrigger>
            <SelectContent>
              {cities.map(city => (
                <SelectItem key={city.name} value={city.name}>{city.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            variant="outline"
            size="sm"
            onClick={handleDiscoverZones}
            disabled={isDiscovering}
            data-testid="button-discover-zones"
          >
            {isDiscovering ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Search className="h-4 w-4 mr-1" />
            )}
            Auto-Detectar
          </Button>
          <Button 
            size="sm" 
            onClick={() => {
              resetForm();
              setShowCreateDialog(true);
            }}
            data-testid="button-create-zone"
          >
            <Plus className="h-4 w-4 mr-1" />
            {t("admin.createZone")}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : zones && zones.length > 0 ? (
            zones.map((zone) => (
              <Card key={zone.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{zone.name}</CardTitle>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditZone(zone)}
                        data-testid={`button-edit-zone-${zone.id}`}
                      >
                        <Search className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteZone(zone.id)}
                        data-testid={`button-delete-zone-${zone.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {zone.centerLat.toFixed(4)}, {zone.centerLng.toFixed(4)}
                    </span>
                    <span>{zone.radiusMeters}m</span>
                    <span className="capitalize">{zone.zoneType}</span>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Radio className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t("admin.noZones")}</p>
            </div>
          )}
        </div>
      </ScrollArea>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingZone ? "Editar Zona" : t("admin.createZone")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="zone-name">{t("admin.zoneName")}</Label>
              <Input
                id="zone-name"
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                placeholder={t("admin.zoneNamePlaceholder")}
                data-testid="input-zone-name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="zone-radius">{t("admin.radius")}</Label>
                <Select value={zoneRadius} onValueChange={setZoneRadius}>
                  <SelectTrigger id="zone-radius" data-testid="select-zone-radius">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50m</SelectItem>
                    <SelectItem value="75">75m</SelectItem>
                    <SelectItem value="100">100m</SelectItem>
                    <SelectItem value="150">150m</SelectItem>
                    <SelectItem value="200">200m</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="zone-type">{t("admin.zoneType")}</Label>
                <Select value={zoneType} onValueChange={setZoneType}>
                  <SelectTrigger id="zone-type" data-testid="select-zone-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="neighborhood">{t("admin.types.neighborhood")}</SelectItem>
                    <SelectItem value="supermarket">{t("admin.types.supermarket")}</SelectItem>
                    <SelectItem value="park">{t("admin.types.park")}</SelectItem>
                    <SelectItem value="school">{t("admin.types.school")}</SelectItem>
                    <SelectItem value="university">{t("admin.types.university")}</SelectItem>
                    <SelectItem value="other">{t("admin.types.other")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("admin.selectLocation")}</Label>
              <p className="text-xs text-muted-foreground">{t("admin.clickMap")}</p>
              <div className="h-64 rounded-md overflow-hidden border">
                <MapContainer
                  center={mapCenter}
                  zoom={15}
                  style={{ height: "100%", width: "100%" }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <LocationPicker
                    position={selectedPosition}
                    onPositionChange={setSelectedPosition}
                  />
                  {selectedPosition && (
                    <Circle
                      center={[selectedPosition.lat, selectedPosition.lng]}
                      radius={parseInt(zoneRadius)}
                      pathOptions={{ color: "hsl(var(--primary))", fillOpacity: 0.2 }}
                    />
                  )}
                </MapContainer>
              </div>
              {selectedPosition && (
                <p className="text-xs text-muted-foreground">
                  {t("admin.selectedCoords")}: {selectedPosition.lat.toFixed(6)}, {selectedPosition.lng.toFixed(6)}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowCreateDialog(false);
              resetForm();
            }}>
              {t("common.cancel")}
            </Button>
            <Button 
              onClick={handleCreateZone} 
              disabled={isCreating || !zoneName.trim() || !selectedPosition}
              data-testid="button-confirm-create-zone"
            >
              {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingZone ? "Guardar Cambios" : t("admin.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
