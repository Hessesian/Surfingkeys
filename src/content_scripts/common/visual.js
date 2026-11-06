// Visual mode, split by what each part owns: visual/session.js is the Mode and its
// state, mappings.js its keys, find.js search and match marks, cursor.js and marks.js
// what is drawn. Pure decisions (the caret/range states) are in core/visualState.ts.
export { default } from './visual/session.js';
