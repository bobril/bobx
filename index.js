"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var b = require("bobril");
function equalsIncludingNaN(a, b) {
    return a === b || (a !== a && b !== b); // it correctly returns true for NaN and NaN
}
function addHiddenProp(object, propName, value) {
    Object.defineProperty(object, propName, {
        enumerable: false,
        writable: true,
        configurable: true,
        value: value
    });
}
function addHiddenFinalProp(object, propName, value) {
    Object.defineProperty(object, propName, {
        enumerable: false,
        writable: false,
        configurable: true,
        value: value
    });
}
function makeNonEnumerable(object, propNames) {
    for (var i = 0; i < propNames.length; i++) {
        addHiddenProp(object, propNames[i], object[propNames[i]]);
    }
}
var lastId = 0;
function allocId() {
    return ++lastId;
}
function isIBobxComputed(v) {
    return v.$bobx === null;
}
var ObservableValue = /** @class */ (function () {
    function ObservableValue(value, enhancer) {
        this.atomId = allocId();
        this.ctxs = undefined;
        this.value = enhancer(value, undefined);
        this.enhancer = enhancer;
        this.$bobx = null;
        this._prop = undefined;
    }
    ObservableValue.prototype.get = function () {
        this.markUsage();
        return this.value;
    };
    ObservableValue.prototype.set = function (value) {
        var newValue = this.enhancer(value, this.value);
        if (!equalsIncludingNaN(newValue, this.value)) {
            this.invalidate();
            this.value = newValue;
        }
    };
    ObservableValue.prototype.prop = function () {
        var _this = this;
        var p = this._prop;
        if (p === undefined) {
            p = function (value) {
                if (value === undefined) {
                    return _this.get();
                }
                _this.set(value);
                return _this.value;
            };
            this._prop = p;
        }
        return p;
    };
    ObservableValue.prototype.markUsage = function () {
        var ctx = b.getCurrentCtx();
        if (ctx === undefined)
            // outside of render => nothing to mark
            return;
        if (isIBobxComputed(ctx)) {
            if (ctx.markUsing(this.atomId, this)) {
                var ctxs = this.ctxs;
                if (ctxs === undefined) {
                    ctxs = new Map();
                    this.ctxs = ctxs;
                }
                ctxs.set(ctx.atomId, ctx);
            }
        }
        else {
            var bobx = ctx.$bobxCtx;
            if (bobx === undefined) {
                bobx = new Map();
                bobx.ctxId = allocId();
                ctx.$bobxCtx = bobx;
            }
            if (bobx.has(this.atomId))
                return;
            bobx.set(this.atomId, this);
            if (this.ctxs === undefined) {
                this.ctxs = new Map();
            }
            this.ctxs.set(bobx.ctxId, ctx);
        }
    };
    ObservableValue.prototype.invalidate = function () {
        var ctxs = this.ctxs;
        if (ctxs === undefined)
            return;
        ctxs.forEach(function (ctx) {
            if (isIBobxComputed(ctx)) {
                ctx.invalidateBy(this.atomId);
            }
            else {
                ctx.$bobxCtx.delete(this.atomId);
                b.invalidate(ctx);
            }
        }, this);
        ctxs.clear();
    };
    ObservableValue.prototype.toJSON = function () {
        return this.get();
    };
    return ObservableValue;
}());
exports.ObservableValue = ObservableValue;
var previousBeforeRender = b.setBeforeRender(function (node, phase) {
    var ctx = b.getCurrentCtx();
    if (phase === 3 /* Destroy */ || phase === 1 /* Update */ || phase === 2 /* LocalUpdate */) {
        var bobx = ctx.$bobxCtx;
        if (bobx !== undefined) {
            bobx.forEach(function (value) {
                value.ctxs.delete(this.ctxId);
            }, bobx);
            if (phase === 3 /* Destroy */) {
                ctx.$bobxCtx = undefined;
            }
            else {
                bobx.clear();
            }
        }
    }
    previousBeforeRender(node, phase);
});
function referenceEnhancer(newValue, _oldValue) {
    return newValue;
}
function isObservable(value) {
    return value != null && value.$bobx !== undefined;
}
exports.isObservable = isObservable;
function isObject(value) {
    return value !== null && typeof value === "object";
}
function isES6Map(value) {
    return value instanceof Map;
}
function isPlainObject(value) {
    if (value === null || typeof value !== "object")
        return false;
    var proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
function asObservableObject(target) {
    var behind = target.$bobx;
    if (behind !== undefined)
        return behind;
    behind = Object.create(null);
    addHiddenFinalProp(target, "$bobx", behind);
    return behind;
}
function asObservableClass(target) {
    var behind = target.$bobx;
    if (behind !== LazyClass)
        return behind;
    behind = {};
    target.$bobx = behind;
    return behind;
}
exports.asObservableClass = asObservableClass;
function deepEqual(a, b) {
    if (a === b)
        return true;
    if (typeof a !== "object" || typeof b !== "object") {
        if (a !== a && b !== b)
            return true;
        return false;
    }
    if (isArrayLike(a)) {
        if (!isArrayLike(b))
            return false;
        var length_1 = a.length;
        if (length_1 != b.length)
            return false;
        var aArray = a.$bobx || a;
        var bArray = b.$bobx || b;
        for (var i = 0; i < length_1; i++) {
            if (!deepEqual(aArray[i], bArray[i]))
                return false;
        }
        return true;
    }
    if (isObservableMap(a)) {
        if (isObservableMap(b)) {
            if (a.size != b.size)
                return false;
            var res_1 = true;
            a.forEach(function (v, k) {
                if (!res_1)
                    return;
                if (!b.has(k)) {
                    res_1 = false;
                    return;
                }
                if (!deepEqual(v, b.get(k)))
                    res_1 = false;
            });
            return res_1;
        }
        var bb_1 = b;
        if (isObservable(b))
            bb_1 = b.$bobx;
        var bKeys_1 = 0;
        for (var _prop in bb_1) {
            bKeys_1++;
        }
        if (a.size != bKeys_1)
            return false;
        var res_2 = true;
        a.forEach(function (v, k) {
            if (!res_2)
                return;
            if (!(k in bb_1)) {
                res_2 = false;
                return;
            }
            if (!deepEqual(v, b[k]))
                res_2 = false;
        });
        return res_2;
    }
    if (isObservableMap(b)) {
        var aa_1 = a;
        if (isObservable(a))
            aa_1 = a.$bobx;
        var aKeys_1 = 0;
        for (var _prop in aa_1) {
            aKeys_1++;
        }
        if (b.size != aKeys_1)
            return false;
        var res_3 = true;
        b.forEach(function (v, k) {
            if (!res_3)
                return;
            if (!(k in aa_1)) {
                res_3 = false;
                return;
            }
            if (!deepEqual(v, a[k]))
                res_3 = false;
        });
        return res_3;
    }
    var aa = a;
    var bb = b;
    if (isObservable(a))
        aa = a.$bobx;
    if (isObservable(b))
        bb = b.$bobx;
    var bKeys = 0;
    for (var _prop in bb) {
        bKeys++;
    }
    var aKeys = 0;
    for (var prop in aa) {
        aKeys++;
        if (!(prop in bb))
            return false;
        if (!deepEqual(a[prop], b[prop]))
            return false;
    }
    return aKeys == bKeys;
}
exports.deepEqual = deepEqual;
var observablePropertyConfigs = Object.create(null);
function generateObservablePropConfig(propName) {
    var config = observablePropertyConfigs[propName];
    if (config)
        return config;
    return (observablePropertyConfigs[propName] = {
        configurable: true,
        enumerable: true,
        get: function () {
            return this.$bobx[propName].get();
        },
        set: function (value) {
            this.$bobx[propName].set(value);
        }
    });
}
function defineObservableProperty(target, behind, propName, newValue, enhancer) {
    behind[propName] = new ObservableValue(newValue, enhancer);
    Object.defineProperty(target, propName, generateObservablePropConfig(propName));
}
// ARRAY
// Detects bug in safari 9.1.1 (or iOS 9 safari mobile). See MobX #364
var safariPrototypeSetterInheritanceBug = (function () {
    var v = false;
    var p = {};
    Object.defineProperty(p, "0", {
        set: function () {
            v = true;
        }
    });
    Object.create(p)["0"] = 1;
    return v === false;
})();
/**
 * This array buffer contains two lists of properties, so that all arrays
 * can recycle their property definitions, which significantly improves performance of creating
 * properties on the fly.
 */
var observableArrayPropCount = 0;
// Typescript workaround to make sure ObservableArray extends Array
var StubArray = /** @class */ (function () {
    function StubArray() {
    }
    return StubArray;
}());
exports.StubArray = StubArray;
StubArray.prototype = [];
var ObservableArray = /** @class */ (function (_super) {
    __extends(ObservableArray, _super);
    function ObservableArray(initialValues, enhancer) {
        var _this = _super.call(this) || this;
        _this.$enhancer = enhancer;
        _this.$atom = new ObservableValue(null, referenceEnhancer);
        if (initialValues && initialValues.length) {
            _this.$bobx = initialValues.map(function (v) { return enhancer(v, undefined); });
        }
        else {
            _this.$bobx = [];
        }
        if (safariPrototypeSetterInheritanceBug) {
            // Seems that Safari won't use numeric prototype setter until any * numeric property is
            // defined on the instance. After that it works fine, even if this property is deleted.
            Object.defineProperty(_this, "0", ENTRY_0);
        }
        return _this;
    }
    ObservableArray.prototype.splice = function (index, deleteCount, newItems) {
        var length = this.$bobx.length;
        if (index === undefined)
            index = 0;
        else if (index > length)
            index = length;
        else if (index < 0)
            index = Math.max(0, length + index);
        if (arguments.length === 1)
            deleteCount = length - index;
        else if (deleteCount == null)
            deleteCount = 0;
        else
            deleteCount = Math.max(0, Math.min(deleteCount, length - index));
        if (newItems === undefined)
            newItems = [];
        if (newItems.length > 0 || deleteCount > 0)
            this.$atom.invalidate();
        reserveArrayBuffer(length + newItems.length - deleteCount);
        for (var i = 0; i < newItems.length; i++) {
            newItems[i] = this.$enhancer(newItems[i], undefined);
        }
        return (_a = this.$bobx).splice.apply(_a, [index, deleteCount].concat(newItems));
        var _a;
    };
    ObservableArray.prototype.setArrayLength = function (newLength) {
        var currentLength = this.$bobx.length;
        if (newLength === currentLength)
            return;
        else if (newLength > currentLength)
            this.splice(currentLength, 0, new Array(newLength - currentLength));
        else
            this.splice(newLength, currentLength - newLength);
    };
    ObservableArray.prototype.clear = function () {
        return this.splice(0);
    };
    ObservableArray.prototype.concat = function () {
        var arrays = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            arrays[_i] = arguments[_i];
        }
        this.$atom.markUsage();
        return Array.prototype.concat.apply(this.$bobx, arrays.map(function (a) { return (isObservableArray(a) ? a.$bobx : a); }));
    };
    ObservableArray.prototype.replace = function (newItems) {
        this.$atom.invalidate();
        return this.splice(0, this.$bobx.length, newItems);
    };
    /**
     * Converts this array back to a (shallow) javascript structure.
     */
    ObservableArray.prototype.toJS = function () {
        return this.slice();
    };
    ObservableArray.prototype.toJSON = function () {
        // Used by JSON.stringify
        return this.$bobx;
    };
    ObservableArray.prototype.find = function (predicate, thisArg, fromIndex) {
        if (fromIndex === void 0) { fromIndex = 0; }
        this.$atom.markUsage();
        var values = this.$bobx, l = values.length;
        for (var i = fromIndex; i < l; i++)
            if (predicate.call(thisArg, values[i], i, this))
                return values[i];
        return undefined;
    };
    ObservableArray.prototype.push = function () {
        var items = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            items[_i] = arguments[_i];
        }
        var values = this.$bobx;
        if (items.length == 0)
            return values.length;
        for (var i = 0; i < items.length; i++) {
            items[i] = this.$enhancer(items[i], undefined);
        }
        values.push.apply(values, items);
        this.$atom.invalidate();
        reserveArrayBuffer(values.length);
        return values.length;
    };
    ObservableArray.prototype.pop = function () {
        return this.splice(Math.max(this.$bobx.length - 1, 0), 1)[0];
    };
    ObservableArray.prototype.shift = function () {
        return this.splice(0, 1)[0];
    };
    ObservableArray.prototype.unshift = function () {
        var items = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            items[_i] = arguments[_i];
        }
        this.splice(0, 0, items);
        return this.$bobx.length;
    };
    ObservableArray.prototype.reverse = function () {
        this.$atom.invalidate();
        var values = this.$bobx;
        values.reverse.apply(values, arguments);
        return this;
    };
    ObservableArray.prototype.sort = function (_compareFn) {
        this.$atom.invalidate();
        var values = this.$bobx;
        values.sort.apply(values, arguments);
        return this;
    };
    ObservableArray.prototype.remove = function (value) {
        var idx = this.$bobx.indexOf(value);
        if (idx > -1) {
            this.splice(idx, 1);
            return true;
        }
        return false;
    };
    ObservableArray.prototype.checkIndex = function (index) {
        if (index < 0) {
            throw new Error("Array index out of bounds: " + index + " is negative");
        }
        var length = this.$bobx.length;
        if (index >= length) {
            throw new Error("Array index out of bounds: " + index + " is not smaller than " + length);
        }
    };
    ObservableArray.prototype.move = function (fromIndex, toIndex) {
        this.checkIndex(fromIndex);
        this.checkIndex(toIndex);
        if (fromIndex === toIndex) {
            return;
        }
        var oldItems = this.$bobx;
        var newItems;
        if (fromIndex < toIndex) {
            newItems = oldItems.slice(0, fromIndex).concat(oldItems.slice(fromIndex + 1, toIndex + 1), [
                oldItems[fromIndex]
            ], oldItems.slice(toIndex + 1));
        }
        else {
            // toIndex < fromIndex
            newItems = oldItems.slice(0, toIndex).concat([
                oldItems[fromIndex]
            ], oldItems.slice(toIndex, fromIndex), oldItems.slice(fromIndex + 1));
        }
        this.replace(newItems);
    };
    ObservableArray.prototype.toString = function () {
        this.$atom.markUsage();
        return Array.prototype.toString.apply(this.$bobx, arguments);
    };
    return ObservableArray;
}(StubArray));
exports.ObservableArray = ObservableArray;
/**
 * We don't want those to show up in `for (const key in ar)` ...
 */
makeNonEnumerable(ObservableArray.prototype, [
    "constructor",
    "intercept",
    "observe",
    "clear",
    "concat",
    "replace",
    "toJS",
    "toJSON",
    "peek",
    "find",
    "splice",
    "push",
    "pop",
    "shift",
    "unshift",
    "reverse",
    "sort",
    "remove",
    "move",
    "toString",
    "toLocaleString",
    "setArrayLength",
    "checkIndex",
    "$atom",
    "$bobx",
    "$enhancer"
]);
Object.defineProperty(ObservableArray.prototype, "length", {
    enumerable: false,
    configurable: true,
    get: function () {
        this.$atom.markUsage();
        return this.$bobx.length;
    },
    set: function (newLength) {
        this.setArrayLength(newLength);
    }
});
// Wrap function from prototype
[
    "every",
    "filter",
    "forEach",
    "indexOf",
    "join",
    "lastIndexOf",
    "map",
    "reduce",
    "reduceRight",
    "slice",
    "some"
].forEach(function (funcName) {
    var baseFunc = Array.prototype[funcName];
    addHiddenProp(ObservableArray.prototype, funcName, function () {
        this.$atom.markUsage();
        return baseFunc.apply(this.$bobx, arguments);
    });
});
var ENTRY_0 = {
    configurable: true,
    enumerable: false,
    set: createArraySetter(0),
    get: createArrayGetter(0)
};
function createArrayBufferItem(index) {
    var set = createArraySetter(index);
    var get = createArrayGetter(index);
    Object.defineProperty(ObservableArray.prototype, "" + index, {
        enumerable: false,
        configurable: true,
        set: set,
        get: get
    });
}
function createArraySetter(index) {
    return function (newValue) {
        var values = this.$bobx;
        if (index < values.length) {
            // update at index in range
            var oldValue = values[index];
            newValue = this.$enhancer(newValue, oldValue);
            var changed = newValue !== oldValue;
            if (changed) {
                this.$atom.invalidate();
                values[index] = newValue;
            }
        }
        else if (index === values.length) {
            // add a new item
            this.push(newValue);
        }
        else
            throw new Error("Array index out of bounds, " + index + " is larger than " + values.length);
    };
}
function createArrayGetter(index) {
    return function () {
        var values = this.$bobx;
        this.$atom.markUsage();
        if (index < values.length) {
            return values[index];
        }
        return undefined;
    };
}
function reserveArrayBuffer(max) {
    max++;
    if (observableArrayPropCount >= max)
        return;
    max = Math.max(Math.ceil(observableArrayPropCount * 1.5), max);
    for (var index = observableArrayPropCount; index < max; index++)
        createArrayBufferItem(index);
    observableArrayPropCount = max;
}
reserveArrayBuffer(100);
function isObservableArray(thing) {
    return isObject(thing) && b.isArray(thing.$bobx);
}
exports.isObservableArray = isObservableArray;
function isArrayLike(thing) {
    return b.isArray(thing) || isObservableArray(thing);
}
var ObservableMapMarker = 0;
function isObservableMap(thing) {
    return isObject(thing) && thing.$bobx === ObservableMapMarker;
}
exports.isObservableMap = isObservableMap;
var ObservableMap = /** @class */ (function () {
    function ObservableMap(init, enhancer) {
        var _this = this;
        this.$enhancer = enhancer;
        this.$atom = new ObservableValue(null, referenceEnhancer);
        this.$content = new Map();
        this._size = 0;
        if (Array.isArray(init))
            init.forEach(function (_a) {
                var key = _a[0], value = _a[1];
                return _this.set(key, value);
            });
        else if (isObservableMap(init) || isES6Map(init)) {
            init.forEach(function (value, key) {
                this.set(key, value);
            }, this);
        }
        else if (isPlainObject(init)) {
            var keys = Object.keys(init);
            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                this.set(key, init[key]);
            }
        }
        else if (init != null)
            throw new Error("Cannot initialize map from " + init);
    }
    Object.defineProperty(ObservableMap.prototype, "size", {
        get: function () {
            this.$atom.markUsage();
            return this._size;
        },
        enumerable: true,
        configurable: true
    });
    ObservableMap.prototype.has = function (key) {
        var cont = this.$content.get(key);
        if (cont !== undefined) {
            cont.markUsage();
            return true;
        }
        this.$atom.markUsage();
        return false;
    };
    ObservableMap.prototype.get = function (key) {
        var cont = this.$content.get(key);
        if (cont !== undefined) {
            return cont.get();
        }
        this.$atom.markUsage();
        return undefined;
    };
    ObservableMap.prototype.set = function (key, value) {
        var cont = this.$content.get(key);
        if (cont !== undefined) {
            cont.set(value);
            return this;
        }
        this.$atom.invalidate();
        this.$content.set(key, new ObservableValue(value, this.$enhancer));
        this._size++;
        return this;
    };
    ObservableMap.prototype.prop = function (key) {
        var _this = this;
        var cont = this.$content.get(key);
        if (cont !== undefined) {
            cont.markUsage();
            return cont.prop();
        }
        this.$atom.markUsage();
        return function (value) {
            if (value === undefined) {
                return _this.get(key);
            }
            _this.set(key, value);
            return _this.get(key);
        };
    };
    ObservableMap.prototype.clear = function () {
        if (this._size == 0)
            return;
        var c = this.$content;
        c.forEach(function (v) { return v.invalidate(); });
        this.$atom.invalidate();
        this._size = 0;
        this.$content.clear();
    };
    ObservableMap.prototype.delete = function (key) {
        this.$atom.invalidate();
        var cont = this.$content.get(key);
        if (cont !== undefined) {
            cont.invalidate();
            this.$content.delete(key);
            this._size--;
            return true;
        }
        return false;
    };
    ObservableMap.prototype.forEach = function (callbackfn, thisArg) {
        this.$atom.markUsage();
        this.$content.forEach(function (value, key) {
            callbackfn.call(thisArg, value.get(), key, this);
        }, this);
    };
    ObservableMap.prototype.toJSON = function () {
        var res = Object.create(null);
        this.$content.forEach(function (v, k) {
            this[k] = v.get();
        }, res);
        return res;
    };
    return ObservableMap;
}());
addHiddenFinalProp(ObservableMap.prototype, "$bobx", ObservableMapMarker);
function deepEnhancer(newValue, oldValue) {
    if (newValue === oldValue)
        return oldValue;
    if (newValue == null)
        return newValue;
    if (isObservable(newValue))
        return newValue;
    if (b.isArray(newValue))
        return new ObservableArray(newValue, deepEnhancer);
    if (isES6Map(newValue))
        return new ObservableMap(newValue, deepEnhancer);
    if (isPlainObject(newValue)) {
        var res = Object.create(Object.getPrototypeOf(newValue));
        var behind = asObservableObject(res);
        for (var key in newValue) {
            defineObservableProperty(res, behind, key, newValue[key], deepEnhancer);
        }
        return res;
    }
    return newValue;
}
function shallowEnhancer(newValue, oldValue) {
    if (newValue === oldValue)
        return oldValue;
    if (newValue == null)
        return newValue;
    if (isObservable(newValue))
        return newValue;
    if (b.isArray(newValue))
        return new ObservableArray(newValue, referenceEnhancer);
    if (isES6Map(newValue))
        return new ObservableMap(newValue, referenceEnhancer);
    if (isPlainObject(newValue)) {
        var res = Object.create(Object.getPrototypeOf(newValue));
        var behind = asObservableObject(res);
        for (var key in newValue) {
            defineObservableProperty(res, behind, key, newValue[key], referenceEnhancer);
        }
        return res;
    }
    throw new Error("shallow observable cannot be used for primitive values");
}
function deepStructEnhancer(newValue, oldValue) {
    if (deepEqual(newValue, oldValue))
        return oldValue;
    if (newValue == null)
        return newValue;
    if (isObservable(newValue))
        return newValue;
    if (b.isArray(newValue))
        return new ObservableArray(newValue, deepStructEnhancer);
    if (isES6Map(newValue))
        return new ObservableMap(newValue, deepStructEnhancer);
    if (isPlainObject(newValue)) {
        var res = Object.create(Object.getPrototypeOf(newValue));
        var behind = asObservableObject(res);
        for (var key in newValue) {
            defineObservableProperty(res, behind, key, newValue[key], deepStructEnhancer);
        }
        return res;
    }
    return newValue;
}
function refStructEnhancer(newValue, oldValue) {
    if (deepEqual(newValue, oldValue))
        return oldValue;
    return newValue;
}
var deepDecorator = createDecoratorForEnhancer(deepEnhancer);
var shallowDecorator = createDecoratorForEnhancer(shallowEnhancer);
var refDecorator = createDecoratorForEnhancer(referenceEnhancer);
var deepStructDecorator = createDecoratorForEnhancer(deepStructEnhancer);
var refStructDecorator = createDecoratorForEnhancer(refStructEnhancer);
var LazyClass = {};
function initObservableClassPrototype(target) {
    // target is actually prototype not instance
    if (!("$bobx" in target)) {
        Object.defineProperty(target, "$bobx", {
            enumerable: false,
            writable: true,
            configurable: true,
            value: LazyClass
        });
        if (!("toJSON" in target)) {
            target.toJSON = function () {
                return this.$bobx;
            };
        }
    }
}
exports.initObservableClassPrototype = initObservableClassPrototype;
function createDecoratorForEnhancer(enhancer) {
    return function classPropertyDecorator(target, propName, _descriptor) {
        initObservableClassPrototype(target);
        return {
            configurable: true,
            enumerable: false,
            get: function () {
                var val = this.$bobx[propName];
                if (val === undefined) {
                    var behind = asObservableClass(this);
                    val = new ObservableValue(undefined, enhancer);
                    behind[propName] = val;
                }
                return val.get();
            },
            set: function (value) {
                var val = this.$bobx[propName];
                if (val === undefined) {
                    var behind = asObservableClass(this);
                    val = new ObservableValue(value, enhancer);
                    behind[propName] = val;
                }
                else {
                    val.set(value);
                }
            }
        };
    };
}
function createObservable(value) {
    if (value === void 0) { value = undefined; }
    // @observable someProp;
    if (typeof arguments[1] === "string")
        return deepDecorator.apply(null, arguments);
    // it is an observable already, done
    if (isObservable(value))
        return value;
    // something that can be converted and mutated?
    var res = deepEnhancer(value, undefined);
    // this value could be converted to a new observable data structure, return it
    if (res !== value)
        return res;
    return new ObservableValue(value, deepEnhancer);
}
exports.observable = createObservable;
exports.observable.map = (function (init) { return new ObservableMap(init, deepEnhancer); });
exports.observable.shallowMap = (function (init) {
    return new ObservableMap(init, referenceEnhancer);
});
exports.observable.deep = deepDecorator;
exports.observable.ref = refDecorator;
exports.observable.shallow = shallowDecorator;
exports.observable.struct = deepStructDecorator;
exports.observable.deep.struct = deepStructDecorator;
exports.observable.ref.struct = refStructDecorator;
var bobxRootCtx = undefined;
b.addRoot(function (root) {
    bobxRootCtx = root.n;
    return undefined;
});
var updateNextFrameList = [];
exports.maxIterations = 100;
var previousReallyBeforeFrame = b.setReallyBeforeFrame(function () {
    var iteration = 0;
    while (iteration++ < exports.maxIterations) {
        var list = updateNextFrameList;
        if (list.length == 0)
            break;
        updateNextFrameList = [];
        for (var i = 0; i < list.length; i++) {
            list[i].updateIfNeeded();
        }
    }
    if (iteration >= exports.maxIterations) {
        throw new Error("Computed values did not stabilize after " + exports.maxIterations + " iterations");
    }
    previousReallyBeforeFrame();
});
var Computed = /** @class */ (function () {
    function Computed(fn, that, comparator) {
        this.atomId = allocId();
        this.$bobx = null;
        this.fn = fn;
        this.that = that;
        this.ctxs = undefined;
        this.value = undefined;
        this.state = 0 /* First */;
        this.exception = undefined;
        this.comparator = comparator;
        this.using = undefined;
        this.usedBy = undefined;
    }
    Computed.prototype.markUsing = function (atomId, atom) {
        var using = this.using;
        if (using === undefined) {
            using = new Map();
            using.set(atomId, atom);
            this.using = using;
            return true;
        }
        if (using.has(atomId))
            return false;
        using.set(atomId, atom);
        return true;
    };
    Computed.prototype.invalidateBy = function (atomId) {
        var using = this.using;
        if (using === undefined)
            return;
        if (using.delete(atomId)) {
            if (this.state === 2 /* Updating */) {
                throw new Error("Modifying inputs during updating computed");
            }
            if (this.state === 3 /* Updated */) {
                this.state = 1 /* NeedRecheck */;
                var usedBy = this.usedBy;
                if (usedBy !== undefined) {
                    this.usedBy = undefined;
                    usedBy.forEach(function (comp) {
                        comp.invalidateBy(this.atomId);
                    }, this);
                }
                if (this.ctxs !== undefined) {
                    updateNextFrameList.push(this);
                    b.invalidate(bobxRootCtx);
                }
            }
        }
    };
    Computed.prototype.markUsage = function () {
        var ctx = b.getCurrentCtx();
        if (ctx === undefined)
            // outside of render => nothing to mark
            return;
        if (isIBobxComputed(ctx)) {
            if (ctx.markUsing(this.atomId, this)) {
                var ctxs = this.usedBy;
                if (ctxs === undefined) {
                    ctxs = new Map();
                    this.usedBy = ctxs;
                }
                ctxs.set(ctx.atomId, ctx);
            }
        }
        else {
            var bobx = ctx.$bobxCtx;
            if (bobx === undefined) {
                bobx = new Map();
                bobx.ctxId = allocId();
                ctx.$bobxCtx = bobx;
            }
            if (bobx.has(this.atomId))
                return;
            bobx.set(this.atomId, this);
            if (this.ctxs === undefined) {
                this.ctxs = new Map();
            }
            this.ctxs.set(bobx.ctxId, ctx);
        }
    };
    Computed.prototype.invalidate = function () {
        var ctxs = this.ctxs;
        if (ctxs === undefined)
            return;
        ctxs.forEach(function (ctx) {
            ctx.$bobxCtx.delete(this.atomId);
            b.invalidate(ctx);
        }, this);
        ctxs.clear();
    };
    Computed.prototype.updateIfNeeded = function () {
        if (this.state === 1 /* NeedRecheck */)
            this.update();
    };
    Computed.prototype.update = function () {
        var backupCurrentCtx = b.getCurrentCtx();
        b.setCurrentCtx(this);
        var isFirst = this.state === 0 /* First */;
        this.state = 2 /* Updating */;
        try {
            var newResult = this.fn.call(this.that);
            if (isFirst || this.exception !== undefined || !this.comparator(this.value, newResult)) {
                this.exception = undefined;
                this.value = newResult;
            }
            else {
                isFirst = true;
            }
        }
        catch (err) {
            this.exception = err;
            this.value = undefined;
        }
        if (!isFirst)
            this.invalidate();
        this.state = 3 /* Updated */;
        b.setCurrentCtx(backupCurrentCtx);
    };
    Computed.prototype.run = function () {
        if (this.state === 2 /* Updating */) {
            throw new Error("Recursively calling computed value");
        }
        this.markUsage();
        if (this.state !== 3 /* Updated */) {
            this.update();
        }
        if (this.exception !== undefined)
            throw this.exception;
        return this.value;
    };
    return Computed;
}());
function buildComputed(comparator) {
    return function (target, propName, descriptor) {
        initObservableClassPrototype(target);
        if (descriptor.get != undefined) {
            var fn_1 = descriptor.get;
            return {
                configurable: true,
                enumerable: false,
                get: function () {
                    var val = this.$bobx[propName];
                    if (val === undefined) {
                        var behind = asObservableClass(this);
                        val = new Computed(fn_1, this, comparator);
                        behind[propName] = val;
                    }
                    return val.run();
                },
                set: descriptor.set
            };
        }
        else {
            var fn_2 = descriptor.value;
            return {
                configurable: true,
                enumerable: false,
                value: function () {
                    var val = this.$bobx[propName];
                    if (val === undefined) {
                        var behind = asObservableClass(this);
                        val = new Computed(fn_2, this, comparator);
                        behind[propName] = val;
                    }
                    return val.run();
                }
            };
        }
    };
}
exports.computed = buildComputed(equalsIncludingNaN);
exports.computed.struct = buildComputed(deepEqual);
exports.computed.equals = buildComputed;
function observableProp(obj, key) {
    if (obj == null)
        throw new Error("observableProp parameter is " + obj);
    var bobx = obj.$bobx;
    if (bobx === undefined)
        throw new Error("observableProp parameter is not observable: " + obj);
    if (bobx === ObservableMapMarker)
        throw new Error("observableProp parameter is observableMap");
    if (b.isArray(bobx)) {
        // Does this pays off to cache and/or inline?
        return function (value) {
            if (value !== undefined) {
                obj[key] = value;
            }
            return obj[key];
        };
    }
    if (Object.getPrototypeOf(bobx) === undefined) {
        return bobx[key].prop();
    }
    bobx = asObservableClass(obj);
    var val = bobx[key];
    if (val === undefined) {
        obj[key]; // Has side effect to create ObservableValue
        val = bobx[key];
    }
    return val.prop();
}
exports.observableProp = observableProp;
