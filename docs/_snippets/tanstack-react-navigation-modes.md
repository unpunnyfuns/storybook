```ts filename="Posts.stories.ts" renderer="react" language="ts" tabTitle="CSF 3"
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

// 👇 The onNavigate spy records every navigation intent
import { onNavigate } from '@storybook/tanstack-react/react-router';

import { Route } from './Posts';

const meta = {
  parameters: {
    tanstack: { router: { route: Route, path: '/posts' } },
  },
} satisfies Meta<typeof Route>;

export default meta;

type Story = StoryObj<typeof meta>;

// 👇 Default ('spy'): clicks are logged to the Actions panel, nothing moves
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('link', { name: 'Next page' }));
    await expect(onNavigate).toHaveBeenCalled();
  },
};

// 👇 'same-route': search/param changes navigate for real; other routes stay put
export const Filtered: Story = {
  parameters: {
    tanstack: { router: { navigation: 'same-route' } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('link', { name: 'Next page' }));
    await waitFor(() => expect(canvas.getByText('Page 2')).toBeVisible());
  },
};

// 👇 'real': all navigation runs in the story's memory router
export const FullNavigation: Story = {
  parameters: {
    tanstack: { router: { navigation: 'real' } },
  },
};
```

```ts filename="Posts.stories.ts" renderer="react" language="ts" tabTitle="CSF Next 🧪"
import { expect, userEvent, waitFor, within } from 'storybook/test';

// 👇 The onNavigate spy records every navigation intent
import { onNavigate } from '@storybook/tanstack-react/react-router';

import preview from '../.storybook/preview';

import { Route } from './Posts';

const meta = preview.meta({
  parameters: {
    tanstack: { router: { route: Route, path: '/posts' } },
  },
});

// 👇 Default ('spy'): clicks are logged to the Actions panel, nothing moves
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('link', { name: 'Next page' }));
    await expect(onNavigate).toHaveBeenCalled();
  },
});

// 👇 'same-route': search/param changes navigate for real; other routes stay put
export const Filtered = meta.story({
  parameters: {
    tanstack: { router: { navigation: 'same-route' } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('link', { name: 'Next page' }));
    await waitFor(() => expect(canvas.getByText('Page 2')).toBeVisible());
  },
});

// 👇 'real': all navigation runs in the story's memory router
export const FullNavigation = meta.story({
  parameters: {
    tanstack: { router: { navigation: 'real' } },
  },
});
```
