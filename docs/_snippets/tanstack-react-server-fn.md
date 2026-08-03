```ts filename="src/lib/updateProfile.ts" renderer="react" language="ts"
import { createServerFn } from '@tanstack/react-start';

export const updateProfile = createServerFn({ method: 'POST' }).handler(
  async ({ data }: { data: { name: string } }) => {
    return { ok: true, name: data.name };
  },
);
```
