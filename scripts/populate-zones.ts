import { findNearbyPlaces } from "../server/geopify";
import { storage } from "../server/storage";

async function populate() {
  // Expanded coordinates to cover more of Santo Domingo and surrounding areas
  const locations = [
    { lat: 18.4861, lng: -69.9312 }, // Center
    { lat: 18.4716, lng: -69.9218 }, // Gazcue
    { lat: 18.4517, lng: -69.9389 }, // Piantini/Naco
    { lat: 18.5123, lng: -69.8732 }, // SD Este
    { lat: 18.4845, lng: -69.9612 }, // Herrera
    { lat: 18.5342, lng: -69.9211 }, // SD Norte
    { lat: 18.4321, lng: -69.9543 }, // Malecon
    { lat: 18.4987, lng: -69.8923 }, // Los Mina
    { lat: 18.4654, lng: -69.9765 }, // Luperon
    { lat: 18.5234, lng: -69.9432 }, // Arroyo Hondo
    { lat: 18.4712, lng: -69.8921 }, // Villa Duarte
    { lat: 18.4456, lng: -69.9612 }, // Haina
    { lat: 18.5432, lng: -69.9876 }, // Los Alcarrizos
    { lat: 18.5678, lng: -69.8543 }, // San Isidro
    { lat: 18.4123, lng: -69.9876 }  // San Cristobal road
  ];

  let totalCreated = 0;
  console.log("Starting zone population...");

  for (const loc of locations) {
    console.log(`Searching near ${loc.lat}, ${loc.lng}...`);
    const places = await findNearbyPlaces(loc.lat, loc.lng);
    
    for (const place of places) {
      const existingZones = await storage.getCommunityZones();
      const duplicate = existingZones.find(z => 
        z.name === place.name || 
        (Math.abs(z.centerLat - place.centerLat) < 0.0001 && Math.abs(z.centerLng - place.centerLng) < 0.0001)
      );

      if (!duplicate) {
        await storage.createCommunityZone(place);
        totalCreated++;
        if (totalCreated % 10 === 0) {
          console.log(`Created ${totalCreated} zones so far...`);
        }
      }
    }
  }

  console.log(`Finished! Created ${totalCreated} total new zones.`);
  process.exit(0);
}

populate().catch(err => {
  console.error(err);
  process.exit(1);
});
