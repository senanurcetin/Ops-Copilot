# **App Name**: Ops-Copilot

## Core Features:

- Knowledge Ingestion: Accepts a JSON array of documents (id, title, content), scopes them to the authenticated user, and stores them in a Firestore-backed knowledge collection.
- Chat Agent: Accepts user questions, retrieves the most relevant user-scoped documents with lexical ranking, constructs a prompt with retrieved context, and sends it to Gemini Flash for an answer.
- Chat UI: A WhatsApp-style chat interface with user bubbles on the right and AI bubbles on the left. Supports state management for chat history and loading skeletons.
- Manual Upload: A 'Load Sample KB' button that reads a local knowledge_base.json file and stores it for the signed-in workspace.
- Secure Sessions: Server-side actions are protected with Firebase-backed session cookies instead of client-only redirects.
- Checklist Logging: Procedural checklist progress is persisted for the current operator workspace.

## Style Guidelines:

- Primary color: Deep navy blue (#1A237E) to inspire trust and a sense of authority befitting a copilot.
- Background color: Light gray (#F5F5F5), a desaturated version of the primary color, creates a clean and professional backdrop.
- Accent color: Soft lavender (#C5CAE9), analogous to the primary color, used to highlight interactive elements and calls to action.
- Font: 'Inter' (sans-serif) for a modern, neutral, and easily readable interface in both headlines and body text.
- Use simple, line-based icons to represent different functions and data types within the application.
- Emphasize a clean, well-organized layout to ensure ease of use for factory operators. Utilize clear visual hierarchy and spacing.
- Incorporate subtle loading animations and transitions to provide feedback during AI processing, ensuring a smooth user experience.
