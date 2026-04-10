import type { Template } from '@maestro-recorder/shared';

export const MAESTRO_TEMPLATES: Template[] = [
  {
    id: 'login-flow',
    name: 'Login Flow',
    description: 'Basic authentication flow: launch app, enter credentials, and verify dashboard',
    category: 'auth',
    yaml: `
- type: launchApp
  appId: com.example.app

- type: tapOn
  selector:
    text: Email

- type: inputText
  text: user@example.com

- type: tapOn
  selector:
    text: Password

- type: inputText
  text: password123

- type: tapOn
  selector:
    text: Sign In

- type: assertVisible
  selector:
    text: Dashboard
`.trim(),
  },
  {
    id: 'navigation-flow',
    name: 'Navigation',
    description: 'Navigate between multiple screens and verify page transitions',
    category: 'navigation',
    yaml: `
- type: launchApp
  appId: com.example.app

- type: tapOn
  selector:
    text: Menu

- type: assertVisible
  selector:
    text: Home

- type: tapOn
  selector:
    text: Profile

- type: assertVisible
  selector:
    text: My Profile

- type: tapOn
  selector:
    text: Settings

- type: assertVisible
  selector:
    text: Preferences
`.trim(),
  },
  {
    id: 'form-fill',
    name: 'Form Fill',
    description: 'Fill out a form with multiple fields and submit',
    category: 'forms',
    yaml: `
- type: launchApp
  appId: com.example.app

- type: tapOn
  selector:
    text: First Name

- type: inputText
  text: John

- type: tapOn
  selector:
    text: Last Name

- type: inputText
  text: Doe

- type: tapOn
  selector:
    text: Email

- type: inputText
  text: john.doe@example.com

- type: tapOn
  selector:
    text: Submit

- type: assertVisible
  selector:
    text: Form submitted successfully
`.trim(),
  },
  {
    id: 'scroll-list',
    name: 'Scroll List',
    description: 'Scroll through a list and interact with items',
    category: 'lists',
    yaml: `
- type: launchApp
  appId: com.example.app

- type: scroll
  direction: down

- type: scrollUntilVisible
  selector:
    text: Item 10
  direction: down

- type: tapOn
  selector:
    text: Item 10

- type: assertVisible
  selector:
    text: Item Details
`.trim(),
  },
  {
    id: 'search-flow',
    name: 'Search',
    description: 'Search for content and verify results',
    category: 'search',
    yaml: `
- type: launchApp
  appId: com.example.app

- type: tapOn
  selector:
    text: Search

- type: inputText
  text: pizza

- type: assertVisible
  selector:
    text: Search Results

- type: tapOn
  selector:
    text: First Result

- type: assertVisible
  selector:
    text: Details Page
`.trim(),
  },
  {
    id: 'back-navigation',
    name: 'Back Navigation',
    description: 'Navigate deep into app and return to home using back button',
    category: 'navigation',
    yaml: `
- type: launchApp
  appId: com.example.app

- type: assertVisible
  selector:
    text: Home Screen

- type: tapOn
  selector:
    text: Category

- type: tapOn
  selector:
    text: Subcategory

- type: tapOn
  selector:
    text: Item

- type: back

- type: back

- type: back

- type: assertVisible
  selector:
    text: Home Screen
`.trim(),
  },
];

export function getAllTemplates(): Template[] {
  return MAESTRO_TEMPLATES;
}

export function getTemplateById(id: string): Template | undefined {
  return MAESTRO_TEMPLATES.find((t) => t.id === id);
}
