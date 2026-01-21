import type { InsertCommunityZone } from "@shared/schema";

const API_KEY = process.env.GEOPIFY_API_KEY;

export async function findNearbyPlaces(lat: number, lng: number): Promise<InsertCommunityZone[]> {
  if (!API_KEY) {
    console.error("GEOPIFY_API_KEY is not set");
    return [];
  }

  // Categories to search for
  const categories = [
    "commercial.supermarket",
    "leisure.park",
    "education.university",
    "education.school"
  ];

  const url = `https://api.geoapify.com/v2/places?categories=${categories.join(",")}&filter=circle:${lng},${lat},10000&limit=100&apiKey=${API_KEY}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Geopify API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    return data.features.map((feature: any) => {
      const props = feature.properties;
      let zoneType: 'neighborhood' | 'supermarket' | 'park' | 'school' | 'university' | 'other' = 'other';
      
      if (props.categories.includes("commercial.supermarket")) zoneType = "supermarket";
      else if (props.categories.includes("leisure.park")) zoneType = "park";
      else if (props.categories.includes("education.university")) zoneType = "university";
      else if (props.categories.includes("education.school")) zoneType = "school";

      return {
        name: props.name || props.street || "Unnamed Zone",
        description: props.address_line2,
        centerLat: props.lat,
        centerLng: props.lon,
        radiusMeters: 150,
        zoneType,
        active: true
      };
    });
  } catch (error) {
    console.error("Error fetching places from Geopify:", error);
    return [];
  }
}
