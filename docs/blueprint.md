# **App Name**: Ops-Copilot

## Core Features:

- Knowledge Ingestion: Accepts a JSON array of documents (id, title, content), generates embeddings using Gemini Pro, and stores them in Firestore.
- Chat Agent: Accepts user questions, generates embeddings, queries Firestore for the most similar documents based on vector cosine similarity (or simulates it), constructs a prompt with retrieved context, and sends it to Gemini Pro for an answer. This feature leverages a tool to incorporate information into its output.
- Chat UI: A WhatsApp-style chat interface with user bubbles on the right and AI bubbles on the left. Supports state management for chat history and loading skeletons.
- Manual Upload: An 'Upload Manual' button that, when clicked, reads a local knowledge_base.json file and sends it to the ingest_knowledge backend endpoint.

## Style Guidelines:

- Primary color: Deep navy blue (#1A237E) to inspire trust and a sense of authority befitting a copilot.
- Background color: Light gray (#F5F5F5), a desaturated version of the primary color, creates a clean and professional backdrop.
- Accent color: Soft lavender (#C5CAE9), analogous to the primary color, used to highlight interactive elements and calls to action.
- Font: 'Inter' (sans-serif) for a modern, neutral, and easily readable interface in both headlines and body text.
- Use simple, line-based icons to represent different functions and data types within the application.
- Emphasize a clean, well-organized layout to ensure ease of use for factory operators. Utilize clear visual hierarchy and spacing.
- Incorporate subtle loading animations and transitions to provide feedback during AI processing, ensuring a smooth user experience.