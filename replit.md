# KLK! Chat

## Overview

A secure private messaging application built with React and Express, inspired by WhatsApp Web and Telegram Web interfaces. The application uses a monochrome (black and white) color scheme and provides one-on-one encrypted chat functionality with support for both registered and anonymous users. Features include real-time messaging via WebSockets, session-based authentication with Passport.js, and a PostgreSQL database for persistent storage.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight alternative to React Router)
- **State Management**: TanStack React Query for server state, React Context for auth state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom theme configuration supporting light/dark modes
- **Build Tool**: Vite with custom plugins for Replit integration

The frontend follows a component-based architecture with:
- Pages in `client/src/pages/` for route-level components
- Reusable UI primitives in `client/src/components/ui/`
- Feature-specific components in `client/src/components/chat/`
- Shared utilities and hooks in `client/src/lib/` and `client/src/hooks/`

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **HTTP Server**: Node's built-in `http.createServer` wrapping Express
- **Real-time**: WebSocket server (ws library) for live messaging
- **Authentication**: Passport.js with Local Strategy, bcrypt for password hashing
- **Session Management**: express-session with connect-pg-simple for PostgreSQL session storage

API routes are registered in `server/routes.ts` with REST endpoints for:
- Authentication (login, register, logout)
- Conversations management
- Message sending/receiving
- User search

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` (shared between client and server)
- **Tables**: users, conversations, conversation_participants, messages, recovery_codes, sessions
- **Migrations**: Drizzle Kit with `db:push` command for schema synchronization

### Authentication Flow
1. Session-based authentication using Passport Local Strategy
2. Passwords hashed with bcrypt (12 salt rounds)
3. Sessions stored in PostgreSQL via connect-pg-simple
4. Support for anonymous user registration with optional account conversion

### Real-time Communication
- WebSocket connections mapped by userId
- Message types: message, typing, read, online, offline, error
- Automatic reconnection on client side with 3-second delay

### Security Features
- Client-side encryption utilities in `client/src/lib/crypto.ts` using Web Crypto API
- RSA-OAEP for key exchange, AES-GCM for message encryption
- Recovery codes for password reset without email
- Session regeneration after password change for security

### User Settings (Dialog-based UI)
- **Profile Dialog**: Edit display name with avatar display
- **Settings Dialog**: Theme toggle (dark/light) and language selection
- **Security Dialog**: Password change with current password verification
- API Endpoints: `PATCH /api/auth/profile`, `POST /api/auth/change-password`

## External Dependencies

### Database
- **PostgreSQL**: Primary database (requires DATABASE_URL environment variable)
- **Drizzle ORM**: Type-safe database queries with Zod schema validation

### Authentication & Sessions
- **Passport.js**: Authentication middleware with Local Strategy
- **bcrypt**: Password hashing
- **connect-pg-simple**: PostgreSQL session store

### UI Framework
- **Radix UI**: Headless UI primitives (accordion, dialog, dropdown, etc.)
- **shadcn/ui**: Pre-built components using Radix + Tailwind
- **Lucide React**: Icon library
- **class-variance-authority**: Component variant management

### Real-time
- **ws**: WebSocket server implementation
- **Custom WebSocket hook**: Client-side connection management

### Form Handling
- **React Hook Form**: Form state management
- **Zod**: Schema validation (shared between client and server via drizzle-zod)

### Date/Time
- **date-fns**: Date formatting and manipulation

### Internationalization (i18n)
- **i18next**: Core internationalization framework
- **react-i18next**: React bindings for i18next
- **i18next-browser-languagedetector**: Automatic browser language detection
- **Supported Languages**: English (en), Spanish (es), French (fr), German (de), Chinese (zh), Japanese (ja), Russian (ru)
- **Translation Files**: Located in `client/src/locales/`
- **Language Detection Order**: navigator > localStorage > htmlTag (fallback to English)

### Mobile App (Capacitor)
- **Framework**: Capacitor for wrapping web app as native iOS/Android
- **Configuration**: `capacitor.config.ts` with app settings and plugins
- **Plugins**: Push Notifications, Status Bar, Splash Screen, Preferences (secure storage), App lifecycle
- **Platforms**: iOS and Android
- **Build Guide**: See `MOBILE_BUILD.md` for compilation instructions
- **Native Push Tokens**: FCM (Android) / APNs (iOS) stored in `native_push_tokens` table

### CORS & Mobile Origins
- **Allowed Origins**: klk.fourone.com.do, fourone.com.do, captain.gruard.com.do, gruard.com, app.gruard.com
- **Mobile Origins**: capacitor://localhost, ionic://localhost
- **Session Cookies**: SameSite="none" in production for cross-origin mobile app support