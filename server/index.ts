import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runMigrations } from "./migrate";

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  if (process.env.NODE_ENV === "production") {
    await runMigrations();
    
    // Auto-populate zones in production if needed
    try {
      const zones = await storage.getCommunityZones();
      if (zones.length < 10) {
        log("Production database has few zones. Starting auto-population...");
        // Import dynamically to avoid loading it in all environments if not needed
        const { findNearbyPlaces } = await import("./geopify");
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
          { lat: 18.5234, lng: -69.9432 }  // Arroyo Hondo
        ];

        for (const loc of locations) {
          const places = await findNearbyPlaces(loc.lat, loc.lng);
          for (const place of places) {
            const currentZones = await storage.getCommunityZones();
            const exists = currentZones.find(z => z.name === place.name);
            if (!exists) {
              await storage.createCommunityZone(place);
            }
          }
        }
        log("Auto-population completed.");
      }
    } catch (err) {
      console.error("Failed to auto-populate zones:", err);
    }
  }
  
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
