# Onboarding Flow Redesign

The current onboarding flow has a high drop-off rate after the second step.
We need to simplify the experience and reduce friction for new users.

## Fix critical signup bug

Users on mobile devices cannot submit the registration form because the submit
button is hidden below the keyboard. This is a critical bug causing lost signups
every day.

## Migrate login page to new design system

Update the login page to use the new component library. Replace legacy styled
components with shadcn/ui primitives. Ensure dark mode works correctly.
