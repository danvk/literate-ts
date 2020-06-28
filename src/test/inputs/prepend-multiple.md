<!-- verifier:prepend-to-following -->
```ts
type AB = 'a' | 'b';
```

<!-- verifier:prepend-to-following -->
```ts
type ABC = AB | 'c';
```

```ts
const c: ABC = 'c';
```
