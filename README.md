# Ops-Copilot: An AI-Powered Industrial Operations Assistant

This is a Next.js application that serves as an AI-powered assistant for industrial operators. It uses a Retrieval-Augmented Generation (RAG) model to answer questions based on a provided knowledge base of technical manuals. It features user authentication, persistent chat history, and an interactive interface to help operators troubleshoot issues efficiently.

## Features

- **AI-Powered Chat:** Converse with an AI assistant (Gemini Pro) that understands context and chat history.
- **Retrieval-Augmented Generation (RAG):** The AI provides answers based on a custom knowledge base (`public/knowledge_base.json`).
- **User Authentication:** Secure sign-in with Google via Firebase Authentication.
- **Persistent Chat History:** Each user's chat history is saved in Firestore and restored across sessions.
- **Interactive UI:**
  - **Smart Highlighting:** Automatically scrolls to and highlights the relevant section in a technical document that corresponds to the AI's answer.
  - **Interactive Checklists:** Converts numbered steps in documents into actionable checklists for operators to track their progress.
  - **Progress Logging:** Allows operators to log completed checklist steps for maintenance records.

## Technical Stack

- **Framework:** [Next.js](https://nextjs.org/) (App Router)
- **AI:** [Google's Gemini Pro](https://deepmind.google/technologies/gemini/) via [Genkit](https://firebase.google.com/docs/genkit)
- **Database & Auth:** [Firebase](https://firebase.google.com/) (Firestore & Authentication)
- **UI:** [React](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/), [ShadCN UI](https://ui.shadcn.com/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Deployment:** Firebase App Hosting

## Project Setup and Configuration

Follow these steps to get the project running locally.

### Prerequisites

- [Node.js](https://nodejs.org/en) (v18 or later)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd <your-project-directory>
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Firebase Project Setup

This project requires a Firebase project with Firestore and Google Authentication enabled.

1.  **Create a Firebase Project:** Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
2.  **Create a Web App:** In your project dashboard, add a new Web App to get your Firebase configuration keys.
3.  **Enable Firestore:** Go to the **Firestore Database** section and create a database.
4.  **Enable Google Authentication:**
    -   Go to the **Authentication** section.
    -   Click on the **Sign-in method** tab.
    -   Select **Google** from the provider list and enable it.
5.  **Add Authorized Domain:**
    -   While still in Authentication settings, go to the **Settings** tab.
    -   Under **Authorized domains**, click **Add domain**.
    -   Add `localhost`. When you deploy your app, you will also need to add your production domain here.

### 4. Configure Environment Variables

Create a file named `.env.local` in the root of the project and add your Firebase configuration keys.

```env
# .env.local

NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=1:...
```

### 5. Run the Development Server

```bash
npm run dev
```

The application should now be running on [http://localhost:9002](http://localhost:9002).

## How It Works

### Knowledge Base

The AI's knowledge comes from the `public/knowledge_base.json` file. You can edit this file to provide your own technical manuals or procedures. When an operator clicks the **"Ingest KB"** button, this data is processed by a Genkit flow and stored in a temporary in-memory vector store for quick retrieval.

### Chat and RAG

When a user asks a question:
1.  The system searches the vector store for the most relevant document chunks.
2.  The user's question, the chat history, and the retrieved documents are sent to the Gemini Pro model.
3.  The model generates a response, which is displayed in the chat. If the answer is based on a document, a reference is shown, which the user can click to open the **Context Inspector**.
