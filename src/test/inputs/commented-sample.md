A final case that triggers this "evolving any" behavior is if a variable is initially `null`. This often comes up when you set a value in a `try`/`catch` block:

<!--
// verifier:prepend-to-following
```ts
function somethingDangerous() {}
```
-->

```ts
let val = null;  // Type is any
try {
  somethingDangerous();
  val = 12;
  val  // Type is number
} catch (e) {
  console.warn('alas!');
}
val  // Type is number | null
```
