<!-- verifier:prepend-to-following -->
<!-- #prefix -->
```ts
type AB = 'a' | 'b';
```

<!-- #combined -->
```ts
const a: AB = 'a';
```

<!-- verifier:reset -->

<!-- #final -->
```ts
const a: AB = 'a';
```
