# KLK! Chat - Design Guidelines

## Design Approach
**Reference-Based**: WhatsApp Web and Telegram Web - clean, minimalist messaging interfaces focused on conversation clarity and efficiency.

## Color System - Monochrome (Black & White)
- **Primary (Light Mode)**: #1a1a1a (near black)
- **Primary (Dark Mode)**: #f2f2f2 (near white)
- **Background (Light)**: #fafafa (off-white)
- **Background (Dark)**: #0d0d0d (near black)
- **Card (Light)**: #ffffff (pure white)
- **Card (Dark)**: #141414 (dark gray)
- **Text**: #1a1a1a (Light mode), #f2f2f2 (Dark mode)
- **Text Secondary**: #666666 (Light), #999999 (Dark)
- **Dividers**: #e0e0e0 (Light), #2a2a2a (Dark)

## Typography
**Font Stack**: Inter, system sans-serif

- **App Header**: 600 weight, 16px
- **Chat List Names**: 500 weight, 16px
- **Chat List Preview**: 400 weight, 14px, muted color
- **Message Bubbles**: 400 weight, 15px
- **Timestamps**: 400 weight, 12px, muted color
- **Input Field**: 400 weight, 15px

## Layout System
**Spacing Units**: Tailwind scale with emphasis on 2, 3, 4, 6, 8, 12 units

**Two-Column Desktop Layout**:
- Left Sidebar (Chat List): 320px fixed width
- Right Panel (Active Conversation): Remaining space (flex-1)
- Mobile: Single column stack, chat list toggles to conversation view

## Component Library

### Navigation/Header
- **App Header**: Logo + "KLK!" branding, user profile icon, settings menu
- **Chat List Header**: Search bar, new chat button, menu options
- **Conversation Header**: Contact name/username, online status indicator, options menu

### Chat List Components
- **Chat Item**: Avatar (40px circle), contact name, last message preview (truncated), timestamp, unread badge
- **Search Bar**: Magnifying glass icon, placeholder "Search or start new chat"
- **New Chat Button**: Icon button with plus icon

### Conversation Components
- **Message Bubbles**:
  - Sent (right-aligned): Slightly darker gray background, rounded corners (8px), max-width 65%
  - Received (left-aligned): Lighter gray background, rounded corners (8px), max-width 65%
  - Timestamp bottom-right inside bubble, 11px, muted color
  - Read receipts: double checkmark icon (optional)

- **Message Input Area**: 
  - Fixed bottom bar
  - Text input field with rounded border, placeholder "Type a message"
  - Send button (paper plane icon)

- **Date Separators**: Centered pill-style badges between messages

### Authentication Screens
- **Login/Register**: Centered card (max-width 400px), KLK! logo at top, clean form fields, black/white CTA buttons
- **Anonymous Mode**: Subtle notice banner about temporary nature

### Special UI Elements
- **Typing Indicator**: Three animated dots in conversation
- **Online Status**: Small gray dot on avatar
- **Empty State**: Centered icon with "Select a chat to start messaging"
- **E2EE Badge**: Lock icon + "End-to-end encrypted" in conversation header

## Responsive Behavior
- **Desktop (1024px+)**: Two-column layout visible
- **Tablet/Mobile (<1024px)**: Stack layout, chat list as primary view, conversation slides in when selected
- **Input field**: Always visible at bottom on mobile, keyboard-aware positioning

## Images
**Logo Placement**: Top-left of chat list sidebar, height 32px, paired with "KLK!" text
**Avatars**: Use placeholder circles with initials for contacts without profile photos

## Key Design Principles
- **High Contrast**: Black and white only, no color tones
- **Whitespace Priority**: Generous padding and spacing
- **Visual Hierarchy**: Bold contact names, muted timestamps/metadata
- **Minimal Ornamentation**: No decorative graphics, clean lines
- **Focus on Readability**: High contrast text, adequate line-height
- **Accessibility**: Keyboard navigation, ARIA labels, sufficient touch targets (44px minimum)
