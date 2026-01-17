# Four One Solutions Chat - Design Guidelines

## Design Approach
**Reference-Based**: WhatsApp Web and Telegram Web - clean, minimalist messaging interfaces focused on conversation clarity and efficiency.

## Color System
- **Primary**: #128C7E (Four One Solutions green)
- **Secondary**: #075E54 (Dark green)
- **Accent**: #25D366 (Bright green for active states, online indicators)
- **Background**: #ECE5DD (Light beige - chat background)
- **UI Elements**: #FFFFFF (White - sidebars, message bubbles)
- **Text**: #303030 (Dark gray)
- **Text Secondary**: #667781 (Lighter gray for timestamps, metadata)
- **Dividers**: #E9EDEF

## Typography
**Font Stack**: Roboto, Inter, SF Pro Display (system fallback)

- **App Header**: 600 weight, 16px
- **Chat List Names**: 500 weight, 16px
- **Chat List Preview**: 400 weight, 14px, #667781
- **Message Bubbles**: 400 weight, 15px
- **Timestamps**: 400 weight, 12px, #667781
- **Input Field**: 400 weight, 15px

## Layout System
**Spacing Units**: Tailwind scale with emphasis on 2, 3, 4, 6, 8, 12 units (px-4, py-3, gap-2, etc.)

**Two-Column Desktop Layout**:
- Left Sidebar (Chat List): 360px fixed width
- Right Panel (Active Conversation): Remaining space (flex-1)
- Mobile: Single column stack, chat list toggles to conversation view

## Component Library

### Navigation/Header
- **App Header**: Logo + "Four One Solutions" branding, user profile icon, settings menu
- **Chat List Header**: Search bar, new chat button, menu options
- **Conversation Header**: Contact name/username, online status indicator, options menu (3-dot)

### Chat List Components
- **Chat Item**: Avatar (40px circle), contact name, last message preview (truncated), timestamp, unread badge (green circle)
- **Search Bar**: Magnifying glass icon, placeholder "Search or start new chat"
- **New Chat Button**: Floating action button (FAB) in green accent color

### Conversation Components
- **Message Bubbles**:
  - Sent (right-aligned): #E7FCD4 background, rounded corners (8px), max-width 65%
  - Received (left-aligned): #FFFFFF background, rounded corners (8px), max-width 65%
  - Timestamp bottom-right inside bubble, 11px, #667781
  - Read receipts: double checkmark icon (optional in basic version)

- **Message Input Area**: 
  - Fixed bottom bar, white background
  - Text input field with rounded border, placeholder "Type a message"
  - Send button (paper plane icon) in accent green

- **Date Separators**: Centered pill-style badges (#E9EDEF background) between messages

### Authentication Screens
- **Login/Register**: Centered card (max-width 400px), Four One Solutions logo at top, clean form fields, primary green CTA buttons
- **OAuth Buttons**: Icon + "Continue with [Provider]" in neutral gray/white
- **Anonymous Mode**: Subtle notice banner about temporary nature

### Special UI Elements
- **Typing Indicator**: Three animated dots in conversation
- **Online Status**: Small green dot (8px) on avatar
- **Empty State**: Centered illustration/icon with "Select a chat to start messaging"
- **E2EE Badge**: Lock icon + "End-to-end encrypted" in conversation header (small, unobtrusive)

## Responsive Behavior
- **Desktop (1024px+)**: Two-column layout visible
- **Tablet/Mobile (<1024px)**: Stack layout, chat list as primary view, conversation slides in when selected
- **Input field**: Always visible at bottom on mobile, keyboard-aware positioning

## Images
**Logo Placement**: Top-left of chat list sidebar, height 32px, paired with "Four One Solutions" text
**Avatars**: Use placeholder circles with initials for contacts without profile photos, 40px in chat list, 48px in conversation header
**No hero images needed** - this is a utility application focused on functionality

## Key Design Principles
- **Whitespace Priority**: 12px standard gap between elements, generous padding in message bubbles (12px horizontal, 8px vertical)
- **Visual Hierarchy**: Bold contact names, muted timestamps/metadata, clear sent vs. received message distinction
- **Minimal Ornamentation**: No shadows except subtle elevation on floating elements, no decorative graphics
- **Focus on Readability**: High contrast text, adequate line-height (1.5), clear message grouping
- **Accessibility**: Keyboard navigation for all actions, ARIA labels on icon-only buttons, sufficient touch targets (44px minimum)