# Dependencies

This document outlines the key dependencies used in the Ops-Copilot project.

## Production Dependencies

### Core Framework
- **next** (15.0+) - React framework for production
- **react** (18.0+) - UI library
- **typescript** - Static type checking

### Firebase
- **firebase** (10.0+) - Backend services (Auth, Firestore, Hosting)
- **@firebase/app** - Core Firebase SDK

### UI Components
- **shadcn/ui** - Reusable UI components
- **tailwindcss** - Utility-first CSS framework
- **@radix-ui** - Headless UI components

### AI/ML
- **@google-cloud/vertexai** - Google Vertex AI integration
- **@genkit-ai/core** - Generative AI framework

### Utilities
- **axios** - HTTP client
- **zustand** - State management
- **date-fns** - Date utilities

## Development Dependencies

### Testing
- **@playwright/test** (1.40+) - End-to-end testing framework
- **jest** - Unit testing framework (if used)
- **@testing-library/react** - React testing utilities

### Code Quality
- **eslint** - Linter
- **prettier** - Code formatter
- **typescript** - Type checker

### Build Tools
- **postcss** - CSS transformer
- **autoprefixer** - CSS vendor prefixes

## Version Management

All dependencies are managed through `package.json` and locked versions in `package-lock.json`.

### Update Policy

1. **Security Updates**: Applied immediately for critical/high severity
2. **Minor Updates**: Applied weekly via Dependabot
3. **Major Updates**: Reviewed and tested before application

### Checking for Vulnerabilities

```bash
# Check for vulnerabilities
npm audit

# Fix automatically (where possible)
npm audit fix

# Fix including major versions
npm audit fix --force
```

## Known Issues & Deprecations

None currently documented.

## Contributing

When adding new dependencies:

1. Check for security vulnerabilities: `npm audit`
2. Verify bundle size impact
3. Check for duplicate dependencies
4. Document in this file
5. Run tests to ensure compatibility

## License

All dependencies comply with the project's license (check LICENSE file).
