# NEXUS 2.0 implementation

Source: approved third Figma variant from [Google Drive Logo/NEXUS_Identity_2_0](https://drive.google.com/drive/folders/1rU3QCrdwCdHB0tYVLIq0W6aPqpj3iOsY).

Verbatim local SVGs: `public/nexus-wordmark.svg`, `public/nexus-x.svg`. Original midnight variant also exists at `docs/assets/nexus-official-midnight.svg`.
Palette: `#0B0F19`, `#061524`, `#00E0FF`, `#4EA8FF`, `#8F9BFF`, `#6E55C6`, `#B9C5CE`.

The visual work does not change Firebase Rules or document permissions. Chat deletion only reports success after Firestore confirms the delete. SSO and real production user isolation require separate authenticated acceptance; local tests are not production evidence.
