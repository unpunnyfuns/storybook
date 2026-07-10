import React from 'react';

import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { onNavigate } from '@storybook/tanstack-react/react-router';
import { Link, Outlet, createRootRoute, createRoute, useSearch } from '@tanstack/react-router';
import { expect, userEvent, waitFor, within } from 'storybook/test';

// Coverage for `parameters.tanstack.router.navigation`:
// - 'spy' (default): clicks are logged to the Actions panel, nothing moves.
// - 'same-route': search/param changes navigate for real; cross-route stays spied.
// - 'real': everything navigates within the story's memory router.

function ItemsPage() {
  const search = useSearch({ strict: false }) as { featured?: boolean };
  const featured = Boolean(search.featured);
  return (
    <div data-testid="items-page">
      <p data-testid="featured-state">featured: {String(featured)}</p>
      <Link to="/items" search={{ featured: !featured }}>
        toggle featured
      </Link>
      <Link to="/other">go elsewhere</Link>
    </div>
  );
}

const RootRoute = createRootRoute({
  component: () => (
    <div>
      <Outlet />
    </div>
  ),
});

const ItemsRoute = createRoute({
  path: '/items',
  validateSearch: (s: Record<string, unknown>) => ({ featured: Boolean(s.featured) }),
  getParentRoute: () => RootRoute,
  component: ItemsPage,
});

const OtherRoute = createRoute({
  path: '/other',
  getParentRoute: () => RootRoute,
  component: () => <p data-testid="other-page">elsewhere</p>,
});

RootRoute.addChildren([ItemsRoute, OtherRoute]);

const meta = {
  component: ItemsPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ItemsPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Default: clicks emit `navigate` actions and the story never moves. */
export const SpyNavigation: Story = {
  parameters: {
    tanstack: { router: { route: ItemsRoute, path: '/items' } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    onNavigate.mockClear();

    await userEvent.click(canvas.getByRole('link', { name: 'toggle featured' }));

    await expect(onNavigate).toHaveBeenCalledTimes(1);
    await expect(canvas.getByTestId('featured-state')).toHaveTextContent('featured: false');
  },
};

/** Search-param navigation is real; cross-route clicks stay spied. */
export const SameRouteNavigation: Story = {
  parameters: {
    tanstack: { router: { route: ItemsRoute, path: '/items', navigation: 'same-route' } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    onNavigate.mockClear();

    await userEvent.click(canvas.getByRole('link', { name: 'toggle featured' }));
    await waitFor(() =>
      expect(canvas.getByTestId('featured-state')).toHaveTextContent('featured: true')
    );

    await userEvent.click(canvas.getByRole('link', { name: 'go elsewhere' }));
    await expect(canvas.getByTestId('items-page')).toBeInTheDocument();
    await expect(onNavigate).toHaveBeenCalledTimes(2);
  },
};

/** Everything navigates; the canvas may leave the story's bound route. */
export const RealNavigation: Story = {
  parameters: {
    tanstack: { router: { route: ItemsRoute, path: '/items', navigation: 'real' } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    onNavigate.mockClear();

    await userEvent.click(canvas.getByRole('link', { name: 'go elsewhere' }));
    await waitFor(() => expect(canvas.getByTestId('other-page')).toBeInTheDocument());
    await expect(onNavigate).toHaveBeenCalledTimes(1);
  },
};
