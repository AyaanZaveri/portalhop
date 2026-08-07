/// <reference types="expo/types" />

// Expo's own expo-env.d.ts carries this same reference, but it is written by
// `expo start` and git-ignored, so it exists only on a machine that has already
// run the dev server. A fresh clone — CI, or anyone building before they run
// anything — has no declaration for `import "./global.css"` and fails to
// typecheck. This file is committed and says the same thing.
export {}

