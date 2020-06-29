This example has a multiline type assertion:

```ts
const o = {x: 1, y: 2};
// type is {
//   x: number;
//   y: number;
// }
```

Whereas this is not a multiline assertion:

```ts
function addWithExtras(a: number, b: number) {
  const c = a + b;  // type is number
  // ...
  return c;
}
```
