# CHANGELOG

## 1.0.6

ObservableArray now supports `hasOwnProperty`.

## 1.0.5

ObservableObject now iterates all written properties including which have undefined value, making it behave like normal object.
Just reading unknown property will not create it anymore, but it still correctly subscribe to any possible future creation of such property through setter.

## 1.0.4

ObservableMap support `keys()`.

## 1.0.3

ObservableObject now iterates only properties which are not undefined. Also it preserve prototype. It makes Jasmine toEqual function correctly compare observable and normal object as equal.

## 1.0.2

ObservableObject should support Object prototype properties.

## 1.0.1

Added missing findIndex method to observableArray.

## 1.0.0

Remove some obsolete workarounds, making it compatible with ES2016+.

ObservableArray is now implemented using Proxy. It for example fixes Array.isArray returning true for ObservableArrays. Generally implementation should be on par with build-in Array.

ObservableObject is now implemented using Proxy. It makes new properties automatically observable, fixing big gotcha with previous implementation.

Small changes in public interface in very rarely used parts so probably it will not be even found.

## 0.29.0

Async Computed feature should be usable.

Make it compatible with noUncheckedIndexedAccess.

## 0.28.1

Fixed compatibility with Bobril 14.15.0

## 0.28.0

Fixed Observable Array splice to be compatible with native Array.

WIP Async Computed feature. (Don't use)

## 0.27.1

Fixed `useObservable`.

## 0.27.0

Added `reaction`, `autorun`, `when`.
Fixed `useComputed` typing.

## 0.26.0

Fixed `useComputed`. And it is now immediately disposed when owner component is destroyed.

## 0.25.0

GetHashCode now supports Arrays too.
New Hooks `useObservable` and `useComputed`.

## 0.24.5

Oops, now fixed in production build too.

## 0.24.4

Fixed bug with wrong resurrecting of unused parametric Computed.

## 0.24.3

Simplified code by merging to usedBy maps in Computed. Added assert that detects resurrection of freed computed.

## 0.24.2

reactiveScope now free only Computed used inside that scope.

## 0.24.1

Another fixes for computed.

## 0.24.0

New feature debugRunWhenInvalidated for debugging when current computed will be invalidated next time.
Some fixes around computed and interrupted.

## 0.23.1

Fixed compilation in TypeScript 3.2.2

## 0.23.0

Export some internals from previous version.

## 0.22.0

`computed` now supports methods with parameters. Yes, just like that. Additionally you can use `computed.customized` which allows customize getHashCode and isEqual methods for better performance.
New exported helper methods: `getStringHashCode(s: string): number`, `getObjectHashCode(value: any): number` (should be used mostly for objects and functions), `getHashCode(value: any): number` (general, should be good for any inputs)

## 0.21.0

New `createTransformer` API, it is basically clone of Mobx with just slightly faster implementation. Computed now correctly immediately free nested computed. ComputedImpl now calls `free` method allowing implementing destructors. Fixed tests in IE11.

## 0.20.0

Optimizations (around exceptions in computed).

## 0.19.0

Made npm package lighter by removing .d.ts and .js

## 0.18.1

Fix hard to reproduce bug.

## 0.18.0

Allow customize interrupt timeout.

## 0.17.0

Don't leak dead computed result.

## 0.16.0

Support overriding computed methods which call super.themselves.

## 0.15.0

Allow Bobril to use ObservableArrays in Vdom. Improved interruptible feature.

## 0.14.0

New feature of interruptible computed and Bobril render functions after spending 10ms budget. This is not just reimplementation of Mobx anymore.
Exported ComputedImpl class for low level reimplementation of computed.

## 0.13.2

Fixed bug with not expanding ObservableArray getters and setters when Array is constructed.

## 0.13.1

Now tested in TS 2.7.1.

## 0.13.0

Updated to latest Bobril. Strict compilation. Prettier settings.

## 0.12.1

Update also index.d.ts

## 0.12.0

BREAKING CHANGES:
. Maps have 2 generic arguments instead of one. Before Key was always string, so fix is add string as type for K.
. Needs latest bobril-build or es2015.collection in libs.

Uses ES6 Map for implementation. Allow to convert ES6 Map to Observable map.

## 0.11.0

Transitively export what is needed to be exported. Now compilable with declaration=true.

## 0.10.0

Exported some functions and classes from implementation.

## 0.9.0

Added @computed.struct, @computed.equals(comparer). Computed property can now be also getter and not just function.

## 0.8.1

Fix for ObservableArray push does not enhancing pushed values.

## 0.8.0

Implement @computed functions like in Mobx. More tests needed.

## 0.7.1

Update to Bobril 7.0.

## 0.6.0

Speed up. Fixes in Observable map. Fixes for shouldChange. New tests. Requires Bobril 6.3.1+.

## 0.5.0

Finished deepEqual for struct based tests.

## 0.4.0

Added tests for Bobril ctxClass. Bobril 6.1.0 or better required.

## 0.3.0

Added observable.map and shallowMap. Added observableProp for nice Bobril usage. Removed some useless exports.

## 0.2.1

Fixed not marking array as used on build in Array functions.

## 0.2.0

Correctly unlink observable when component instance is destroyed.

## 0.1.0

First version. Early development drop.
