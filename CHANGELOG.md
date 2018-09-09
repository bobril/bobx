# CHANGELOG

## 0.19.0

Made npm package lighter by removing .d.ts and .js

## 0.18.1

Fix hard to reproduce bug.

## 0.18.0

Allow customize interrupt timeout.

## 0.17.0

Don't leak dead computed result.

## 0.16.0

Support overriding computed methods which call super.themself.

## 0.15.0

Allow Bobril to use ObservableArrays in Vdom. Improved interruptible feature.

## 0.14.0

New feature of interruptible computed and Bobril render functions after spending 10ms budget. This not just reimplementation of Mobx anymore.
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
