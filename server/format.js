// Money for messages shown to people: 9500 → "9,500 ֏". The API's numbers stay plain integers.
export const amd = (n) => `${n.toLocaleString('en-US')} ֏`;
