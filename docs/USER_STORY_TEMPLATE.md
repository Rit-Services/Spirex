# User Story Template for AI Factory

**Template Version**: 1.0
**Last Updated**: 2025-11-27

---

## 📋 How to Use This Template

1. **Copy this template** for each new user story
2. **Follow the naming convention**: `{number}-{feature-name}.md` (e.g., `001-user-authentication.md`)
3. **Fill in all required sections** marked with ⚠️
4. **Delete placeholder text** and instructions (everything in `<!-- -->` comments)
5. **Run validation** before committing: `.\run_ai_factory.ps1 -UserStoryDirectories ".\user-stories" -EnableStoryMode -UseClaudeValidation`

---

## Template Structure

```markdown
# User Story: {Story Title} ⚠️

**Story ID**: STORY-{XXX} ⚠️
**Epic**: {Epic Name} (e.g., "User Management", "Dashboard", "Integration")
**Priority**: {High/Medium/Low} ⚠️
**Story Points**: {1-5} ⚠️
**Layer**: {Backend/API/Frontend/DevOps/Documentation} ⚠️

<!--
NAMING CONVENTION:
- Filename MUST start with a number for execution ordering
- Examples: 001-user-model.md, 002-user-api.md, 003-user-ui.md
-->

---

## Dependencies

<!-- List dependencies on other stories -->
- **{STORY-ID}** ({Story Name}) - {Why it's needed}
- **{STORY-ID}** ({Story Name}) - {Why it's needed}

<!-- Example:
- **STORY-001** (Database Schema) - MUST be completed first for user table
- **STORY-005** (Auth API) - Required for token validation
-->

---

## User Story ⚠️

<!-- Follow the standard format: As a [user type], I want [goal], So that [benefit] -->

As a **{user role}**,
I want to **{action/feature}**,
So that **{business value/benefit}**.

<!-- Example:
As a **system administrator**,
I want to manage user roles and permissions through an admin interface,
So that I can control access to sensitive features and maintain security.
-->

---

## Implementation Order

<!-- Specify the execution sequence - CRITICAL for AI Factory -->

### 1. {TIER 1 - e.g., BACKEND (Database & Business Logic)}
- {Implementation item 1}
- {Implementation item 2}
- {Implementation item 3}

### 2. {TIER 2 - e.g., API (REST Endpoints)} *(if applicable)*
- {Implementation item 1}
- {Implementation item 2}

### 3. {TIER 3 - e.g., FRONTEND (UI Components)} *(if applicable)*
- {Implementation item 1}
- {Implementation item 2}

<!--
EXECUTION ORDER RULES:
✅ Backend → API → Frontend (proper layering)
❌ Frontend → Backend (violates architecture)

Examples:
- Backend-only story: Only section 1
- API-only story: Only section 2
- Full-stack story: All 3 sections
-->

---

## Acceptance Criteria ⚠️

<!-- Clear, testable criteria - REQUIRED for QA validation -->

### {Category 1 - e.g., Functional Requirements}:

1. **{Criterion 1}**
   - {Specific requirement detail}
   - {Expected behavior}
   - {Edge cases to handle}

2. **{Criterion 2}**
   - {Specific requirement detail}
   - {Expected behavior}

### {Category 2 - e.g., Performance Requirements}:

1. **{Criterion 1}**
   - {Measurable performance metric}
   - {Acceptable thresholds}

### {Category 3 - e.g., Security Requirements}:

1. **{Criterion 1}**
   - {Security controls}
   - {Validation rules}

<!--
EXAMPLES:

### Functional Requirements:
1. **User Registration**
   - Email validation (RFC 5322 compliant)
   - Password strength: min 8 chars, uppercase, lowercase, number, special char
   - Duplicate email detection with clear error message

### Performance Requirements:
1. **Response Time**
   - API endpoint responds in < 200ms (p95)
   - Database query execution < 100ms
   - Handles 100 concurrent registrations

### Security Requirements:
1. **Password Storage**
   - Passwords hashed with bcrypt (cost factor 12)
   - Salting per user
   - No plain-text storage anywhere
-->

---

## Technical Details

<!-- Technical implementation notes for the Dev agent -->

### Technology Stack:
- **Backend**: {e.g., Node.js, Express, Python/FastAPI, Go}
- **Database**: {e.g., PostgreSQL, MongoDB, Redis}
- **Frontend**: {e.g., React, Vue, Next.js} *(if applicable)*
- **Testing**: {e.g., Jest, Playwright, Pytest}

### Architecture:
- {Architectural pattern or approach}
- {Key design decisions}
- {Integration points}

### Data Models *(Backend/API stories)*:
```typescript
// Example schema/model
interface {ModelName} {
  id: string;
  field1: type;
  field2: type;
  // ... more fields
}
```

### API Endpoints *(API stories)*:
```
POST   /api/{resource}         - {Description}
GET    /api/{resource}/:id     - {Description}
PUT    /api/{resource}/:id     - {Description}
DELETE /api/{resource}/:id     - {Description}
```

### UI Components *(Frontend stories)*:
- `{ComponentName}` - {Purpose and behavior}
- `{ComponentName}` - {Purpose and behavior}

---

## Design Files ⚠️ *(REQUIRED for Frontend/UI stories)*

<!--
VALIDATION RULE: All Frontend/UI stories MUST reference design files
Place design files in: ./Designs/
Accepted formats: .png, .jpg, .pdf, .html, .figma, .sketch
-->

**Design References**:
- `Designs/{design-file-name}.html` - {Interactive HTML wireframe}
- `Designs/{design-file-name}.png` - {Static mockup/screenshot}
- `Designs/{design-file-name}.figma` - {Figma link or description}

<!--
EXAMPLES:
- `Designs/LoginPage.png` - Main login screen layout (desktop + mobile)
- `Designs/Dashboard.figma` - Interactive dashboard prototype
- `Designs/UserProfile-Desktop.png` - User profile page (desktop view)
- `Designs/UserProfile-Mobile.png` - User profile page (mobile view)

NOTE: Backend/API/DevOps stories do NOT need design files
-->

---

## Docker Configuration ⚠️ *(REQUIRED for Backend/API stories)*

<!--
VALIDATION RULE: Backend and API stories MUST document Docker/port configuration
-->

**Container Configuration**:
- **Service Name**: `{service-name}` (e.g., `user-api`, `auth-backend`)
- **Port**: `{port-number}` (e.g., `4001`, `4002`) ⚠️
- **Container Name**: `{container-name}` (e.g., `app-user-service`)
- **Dependencies**: {List dependent services - e.g., PostgreSQL, Redis}
- **Environment Variables**:
  ```bash
  DATABASE_URL=postgresql://...
  REDIS_URL=redis://...
  JWT_SECRET=${JWT_SECRET}
  ```

**Docker Compose Snippet**:
```yaml
services:
  {service-name}:
    build: ./backend
    ports:
      - "{external-port}:{internal-port}"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=${DATABASE_URL}
    depends_on:
      - postgres
      - redis
```

<!--
NOTE: Frontend stories may document ports for dev server (e.g., 3201). NEVER use framework defaults like 5173, 3000, 8080 - use project-specific ports from environment.md
DevOps stories document all infrastructure ports
-->

---

## Testing Requirements

### Unit Tests *(All stories)*:
- {Component/function to test}
- {Expected coverage: e.g., >80%}
- {Critical test cases}

### Integration Tests *(Backend/API stories)*:
- {API endpoint integration test}
- {Database integration test}
- {External service integration test}

### E2E Tests with Playwright ⚠️ *(REQUIRED for Frontend/UI stories)*:

<!--
VALIDATION RULE: Frontend/UI stories MUST specify Playwright E2E tests
-->

**Test Scenarios**:
1. **{Test Name}** - {Description}
   ```typescript
   // Example test structure
   test('{test description}', async ({ page }) => {
     // Test implementation
   });
   ```

2. **{Test Name}** - {Description}

**User Flows to Test**:
- {User journey 1}
- {User journey 2}
- {Error scenarios}

<!--
EXAMPLES:

1. **User Login Flow** - Verify successful authentication
   - Navigate to login page
   - Fill email and password
   - Submit form
   - Assert redirect to dashboard
   - Verify JWT token stored

2. **Validation Errors** - Test form validation
   - Submit with empty email
   - Assert error message displayed
   - Submit with invalid email format
   - Assert specific error message
-->

---

## Definition of Done ⚠️

<!-- Checklist - ALL items must be completed -->

- [ ] Code implemented and follows project conventions
- [ ] Unit tests written and passing (coverage ≥ {X}%)
- [ ] Integration tests passing *(Backend/API)*
- [ ] Playwright E2E tests passing *(Frontend/UI)*
- [ ] Code reviewed and approved
- [ ] API documentation updated *(API stories)*
- [ ] Database migrations created and tested *(Backend stories with schema changes)*
- [ ] Docker configuration tested and working
- [ ] No security vulnerabilities (OWASP Top 10)
- [ ] Performance benchmarks met
- [ ] Accessibility standards met *(Frontend/UI)* - WCAG 2.1 Level AA
- [ ] Design matches specifications *(Frontend/UI)*
- [ ] All acceptance criteria verified
- [ ] Deployed to dev environment and smoke tested

---

## Notes

<!-- Additional context, assumptions, or open questions -->

### Assumptions:
- {Assumption 1}
- {Assumption 2}

### Open Questions:
- [ ] {Question 1}
- [ ] {Question 2}

### Future Enhancements *(Out of scope for this story)*:
- {Enhancement 1}
- {Enhancement 2}

---

## Validation Checklist ✅

Before submitting this story, verify:

- [ ] **Story Points**: Specified and ≤ 5
- [ ] **Filename**: Starts with a number (e.g., `001-`, `002-`)
- [ ] **Layer**: Clearly specified (Backend/API/Frontend/DevOps)
- [ ] **Execution Order**: Follows Backend → API → Frontend
- [ ] **Dependencies**: All prerequisite stories listed
- [ ] **Acceptance Criteria**: Clear and testable
- [ ] **Design Files**: Referenced (if Frontend/UI story) and exist in `Designs/` folder
- [ ] **Docker Config**: Port and container details (if Backend/API story)
- [ ] **Playwright Tests**: Specified (if Frontend/UI story)
- [ ] **Definition of Done**: All items applicable to this story

**Run validation**:
```powershell
.\run_ai_factory.ps1 `
    -UserStoryDirectories ".\user-stories" `
    -EnableStoryMode `
    -UseClaudeValidation
```

---

**Template created for AI Factory v1.0**
**Optimized for Claude-based semantic validation**
```

---

## Quick Start Example

Here's a filled-in example:

```markdown
# User Story: User Authentication API

**Story ID**: STORY-001
**Epic**: User Management
**Priority**: High
**Story Points**: 3
**Layer**: Backend

---

## Dependencies

*None* - This is a foundational story

---

## User Story

As a **mobile and web application**,
I want to **authenticate users via JWT tokens**,
So that **users can securely access protected resources**.

---

## Implementation Order

### 1. BACKEND (Database & Business Logic)
- User model with email/password fields
- bcrypt password hashing service
- JWT token generation and validation
- Authentication middleware

---

## Acceptance Criteria

### Functional Requirements:

1. **User Login**
   - Accepts email and password via POST /api/auth/login
   - Returns JWT token on success
   - Returns 401 on invalid credentials

2. **Token Validation**
   - Middleware validates JWT on protected routes
   - Expires after 24 hours
   - Returns 401 if expired or invalid

### Security Requirements:

1. **Password Security**
   - Passwords hashed with bcrypt (cost 12)
   - No plain-text storage
   - Rate limiting: 5 failed attempts = 15 min lockout

---

## Technical Details

### Technology Stack:
- **Backend**: Node.js, Express
- **Database**: PostgreSQL
- **Auth**: jsonwebtoken, bcrypt

### API Endpoints:
```
POST   /api/auth/login      - User login
POST   /api/auth/logout     - Invalidate token
POST   /api/auth/refresh    - Refresh expired token
GET    /api/auth/me         - Get current user
```

---

## Docker Configuration

**Container Configuration**:
- **Service Name**: `auth-api`
- **Port**: `4001`
- **Container Name**: `app-auth-service`
- **Dependencies**: PostgreSQL
- **Environment Variables**:
  ```bash
  DATABASE_URL=postgresql://user:pass@postgres:5432/appdb
  JWT_SECRET=${JWT_SECRET}
  JWT_EXPIRY=24h
  ```

---

## Testing Requirements

### Unit Tests:
- Password hashing/verification
- JWT generation/validation
- User model CRUD operations
- Coverage: ≥85%

### Integration Tests:
- Login endpoint with valid/invalid credentials
- Token validation middleware
- Database connection and queries

---

## Definition of Done

- [x] Code implemented following REST conventions
- [x] Unit tests passing (87% coverage)
- [x] Integration tests passing
- [x] Docker configuration tested
- [x] API documented in Swagger
- [x] Security audit passed (no SQL injection, XSS)
- [x] Performance: <100ms response time
- [x] Deployed to dev and smoke tested

---

## Validation Checklist ✅

- [x] Story Points: 3 (≤ 5)
- [x] Filename: `001-user-authentication-api.md`
- [x] Layer: Backend
- [x] Docker Config: Port 4001 specified
- [x] No design files needed (Backend story)
- [x] No Playwright tests needed (Backend story)
```

---

## Template Files Location

Save user stories in:
```
your-project/
├── user-stories/          ← Your story files go here
│   ├── 001-story-name.md
│   ├── 002-story-name.md
│   └── ...
├── Designs/               ← Design files referenced in stories
│   ├── LoginPage.png
│   ├── Dashboard.figma
│   └── ...
└── run_ai_factory.ps1     ← Run validation
```
