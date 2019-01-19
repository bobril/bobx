import * as b from "bobril";

declare var DEBUG: boolean;

function equalsIncludingNaN(a: any, b: any) {
    return a === b || (a !== a && b !== b); // it correctly returns true for NaN and NaN
}

function addHiddenProp(object: any, propName: string, value: any) {
    Object.defineProperty(object, propName, {
        enumerable: false,
        writable: true,
        configurable: true,
        value
    });
}

function addHiddenFinalProp(object: any, propName: string, value: any) {
    Object.defineProperty(object, propName, {
        enumerable: false,
        writable: false,
        configurable: true,
        value
    });
}

function makeNonEnumerable(object: any, propNames: string[]) {
    for (let i = 0; i < propNames.length; i++) {
        addHiddenProp(object, propNames[i], object[propNames[i]]);
    }
}

export type AtomId = number;

export type CtxId = number;

export interface IBobXInCtx extends IMap<AtomId, IAtom> {
    ctxId?: CtxId;
}

export interface IBobXBobrilCtx extends b.IBobrilCtx {
    $bobxCtx?: IBobXInCtx | undefined;
}

export interface IObservable {
    $bobx: any;
}

export interface IAtom extends IObservable {
    atomId: AtomId;
}

export interface IBobxComputed extends IAtom {
    $bobx: 1;
    partialResults: boolean;
    markUsing(atomId: AtomId, atom: IAtom): boolean;
    unmarkUsedBy(atomId: AtomId): void;
    unmarkCtx(ctxId: AtomId): void;
    invalidateBy(atomId: AtomId): void;
    update(): void;
    updateIfNeeded(): void;
    buryIfDead(): void;
    onInvalidated?: (that: IBobxComputed) => void;
}

export type IBobxCallerCtx = IBobxComputed | IBobXBobrilCtx;

export type IEnhancer<T> = (newValue: T, curValue: T | undefined) => T;

export interface IObservableValue<T> {
    get(): T;
    set(value: T): void;
    prop(): b.IProp<T>;
}

let lastId = 0;

function allocId(): AtomId & CtxId {
    return ++lastId;
}

function isIBobxComputed(v: IBobxCallerCtx | IObservable): v is IBobxComputed {
    return (v as IBobxComputed).$bobx === ComputedMarker;
}

export class ObservableValue<T> implements IObservableValue<T>, IAtom {
    constructor(value: T, enhancer: IEnhancer<T>) {
        this.atomId = allocId();
        this.ctxs = undefined;
        this.value = enhancer(value, undefined);
        this.enhancer = enhancer;
        this.$bobx = null;
        this._prop = undefined;
    }

    $bobx: null;

    enhancer: IEnhancer<T>;
    value: T;
    get(): T {
        this.markUsage();
        return this.value;
    }

    set(value: T): void {
        const newValue = this.enhancer(value, this.value);
        if (!equalsIncludingNaN(newValue, this.value)) {
            this.invalidate();
            this.value = newValue;
        }
    }

    prop(): b.IProp<T> {
        let p = this._prop;
        if (p === undefined) {
            p = (value?: T) => {
                if (value === undefined) {
                    return this.get();
                }
                this.set(value);
                return this.value;
            };
            this._prop = p;
        }
        return p;
    }

    _prop: b.IProp<T> | undefined;

    atomId: AtomId;

    ctxs: Map<CtxId, IBobxCallerCtx> | undefined;

    markUsage() {
        const ctx = b.getCurrentCtx() as IBobxCallerCtx;
        if (ctx === undefined)
            // outside of render => nothing to mark
            return;
        if (isIBobxComputed(ctx)) {
            if (ctx.markUsing(this.atomId, this)) {
                let ctxs = this.ctxs;
                if (ctxs === undefined) {
                    ctxs = new Map();
                    this.ctxs = ctxs;
                }
                ctxs.set(ctx.atomId, ctx);
            }
        } else {
            let bobx = ctx.$bobxCtx;
            if (bobx === undefined) {
                bobx = new Map() as IBobXInCtx;
                bobx.ctxId = allocId();
                ctx.$bobxCtx = bobx;
            }
            if (bobx.has(this.atomId)) return;
            bobx.set(this.atomId, this);
            if (this.ctxs === undefined) {
                this.ctxs = new Map();
            }
            this.ctxs.set(bobx.ctxId!, ctx);
        }
    }

    invalidate() {
        const ctxs = this.ctxs;
        if (ctxs === undefined) return;
        ctxs.forEach(function(this: ObservableValue<T>, ctx) {
            if (isIBobxComputed(ctx)) {
                ctx.invalidateBy(this.atomId);
            } else {
                ctx.$bobxCtx!.delete(this.atomId);
                b.invalidate(ctx);
            }
        }, this);
        ctxs.clear();
    }

    toJSON() {
        return this.get();
    }
}

let previousBeforeRender = b.setBeforeRender((node: b.IBobrilNode, phase: b.RenderPhase) => {
    const ctx = b.getCurrentCtx() as IBobXBobrilCtx;
    if (phase === b.RenderPhase.Destroy || phase === b.RenderPhase.Update || phase === b.RenderPhase.LocalUpdate) {
        outsideOfComputedPartialResults = false;
        let bobx = ctx.$bobxCtx;
        if (bobx !== undefined) {
            bobx.forEach(function(this: IBobXInCtx, value: IAtom) {
                if (isIBobxComputed(value)) {
                    value.unmarkCtx(this.ctxId!);
                } else {
                    (value as ObservableValue<any>).ctxs!.delete(this.ctxId!);
                }
            }, bobx);
            if (phase === b.RenderPhase.Destroy) {
                ctx.$bobxCtx = undefined;
            } else {
                bobx.clear();
            }
        }
    }
    previousBeforeRender(node, phase);
});

function referenceEnhancer<T>(newValue: T, _oldValue: T | undefined): T {
    return newValue;
}

export function isObservable(value: any) {
    return value != null && value.$bobx !== undefined;
}

function isObject(value: any): boolean {
    return value !== null && typeof value === "object";
}

function isES6Map(value: any): value is Map<string, any> {
    return value instanceof Map;
}

function isPlainObject(value: any): value is object {
    if (value === null || typeof value !== "object") return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function asObservableObject(target: Object): ObservableObjectBehind {
    let behind = (target as IAtom).$bobx;
    if (behind !== undefined) return behind;
    behind = Object.create(null);
    addHiddenFinalProp(target, "$bobx", behind);
    return behind;
}

export function asObservableClass(target: Object): ObservableObjectBehind {
    let behind = (target as IAtom).$bobx;
    if (behind !== LazyClass) return behind;
    behind = {};
    (target as any).$bobx = behind;
    return behind;
}

export function deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (typeof a !== "object" || typeof b !== "object") {
        if (a !== a && b !== b) return true;
        return false;
    }
    if (isArrayLike(a)) {
        if (!isArrayLike(b)) return false;
        const length = a.length;
        if (length != b.length) return false;
        const aArray = (a as any).$bobx || a;
        const bArray = (b as any).$bobx || b;
        for (let i = 0; i < length; i++) {
            if (!deepEqual(aArray[i], bArray[i])) return false;
        }
        return true;
    }
    if (isObservableMap(a)) {
        if (isObservableMap(b)) {
            if (a.size != b.size) return false;
            let res = true;
            a.forEach((v, k) => {
                if (!res) return;
                if (!b.has(k)) {
                    res = false;
                    return;
                }
                if (!deepEqual(v, b.get(k))) res = false;
            });
            return res;
        }
        let bb = b;
        if (isObservable(b)) bb = b.$bobx;
        let bKeys = 0;
        for (let _prop in bb) {
            bKeys++;
        }
        if (a.size != bKeys) return false;
        let res = true;
        a.forEach((v, k) => {
            if (!res) return;
            if (!(k in bb)) {
                res = false;
                return;
            }
            if (!deepEqual(v, b[k])) res = false;
        });
        return res;
    }
    if (isObservableMap(b)) {
        let aa = a;
        if (isObservable(a)) aa = a.$bobx;
        let aKeys = 0;
        for (let _prop in aa) {
            aKeys++;
        }
        if (b.size != aKeys) return false;
        let res = true;
        b.forEach((v, k) => {
            if (!res) return;
            if (!(k in aa)) {
                res = false;
                return;
            }
            if (!deepEqual(v, a[k])) res = false;
        });
        return res;
    }
    let aa = a;
    let bb = b;
    if (isObservable(a)) aa = a.$bobx;
    if (isObservable(b)) bb = b.$bobx;
    let bKeys = 0;
    for (let _prop in bb) {
        bKeys++;
    }
    let aKeys = 0;
    for (let prop in aa) {
        aKeys++;
        if (!(prop in bb)) return false;
        if (!deepEqual(a[prop], b[prop])) return false;
    }
    return aKeys == bKeys;
}

const observablePropertyConfigs: { [propName: string]: any } = Object.create(null);

function generateObservablePropConfig(propName: string) {
    const config = observablePropertyConfigs[propName];
    if (config) return config;
    return (observablePropertyConfigs[propName] = {
        configurable: true,
        enumerable: true,
        get: function(this: IAtom) {
            return this.$bobx[propName].get();
        },
        set: function(this: IAtom, value: any) {
            this.$bobx[propName].set(value);
        }
    });
}

export type ObservableObjectBehind = { [prop: string]: IObservableValue<any> };

function defineObservableProperty(
    target: Object,
    behind: ObservableObjectBehind,
    propName: string,
    newValue: any,
    enhancer: IEnhancer<any>
) {
    behind[propName] = new ObservableValue(newValue, enhancer);
    Object.defineProperty(target, propName, generateObservablePropConfig(propName));
}

// ARRAY

// Detects bug in safari 9.1.1 (or iOS 9 safari mobile). See MobX #364
const safariPrototypeSetterInheritanceBug = (() => {
    let v = false;
    const p = {};
    Object.defineProperty(p, "0", {
        set: () => {
            v = true;
        }
    });
    (Object.create(p) as any)["0"] = 1;
    return v === false;
})();

export interface IObservableArray<T> extends Array<T> {
    clear(): T[];
    replace(newItems: T[]): T[];
    find(
        predicate: (item: T, index: number, array: IObservableArray<T>) => boolean,
        thisArg?: any,
        fromIndex?: number
    ): T;
    remove(value: T): boolean;
    move(fromIndex: number, toIndex: number): void;
}

/**
 * This array buffer contains two lists of properties, so that all arrays
 * can recycle their property definitions, which significantly improves performance of creating
 * properties on the fly.
 */
let observableArrayPropCount = 0;

// Typescript workaround to make sure ObservableArray extends Array
export class StubArray {}
StubArray.prototype = [];

export class ObservableArray<T> extends StubArray {
    $bobx: Array<T>;
    $enhancer: IEnhancer<T>;
    $atom: ObservableValue<any>;

    constructor(initialValues: T[] | undefined, enhancer: IEnhancer<T>) {
        super();

        this.$enhancer = enhancer;
        this.$atom = new ObservableValue<any>(null, referenceEnhancer);

        if (initialValues && initialValues.length) {
            reserveArrayBuffer(initialValues.length);
            this.$bobx = initialValues.map(v => enhancer(v, undefined));
        } else {
            this.$bobx = [];
        }

        if (safariPrototypeSetterInheritanceBug) {
            // Seems that Safari won't use numeric prototype setter until any * numeric property is
            // defined on the instance. After that it works fine, even if this property is deleted.
            Object.defineProperty(this, "0", ENTRY_0);
        }
    }

    splice(index?: number, deleteCount?: number, newItems?: T[]): T[] {
        const length = this.$bobx.length;

        if (index === undefined) index = 0;
        else if (index > length) index = length;
        else if (index < 0) index = Math.max(0, length + index);

        if (arguments.length === 1) deleteCount = length - index;
        else if (deleteCount == null) deleteCount = 0;
        else deleteCount = Math.max(0, Math.min(deleteCount, length - index));

        if (newItems === undefined) newItems = [];

        if (newItems.length > 0 || deleteCount > 0) this.$atom.invalidate();
        reserveArrayBuffer(length + newItems.length - deleteCount);

        for (let i = 0; i < newItems.length; i++) {
            newItems[i] = this.$enhancer(newItems[i], undefined);
        }
        return this.$bobx.splice(index, deleteCount, ...newItems);
    }

    setArrayLength(newLength: number) {
        let currentLength = this.$bobx.length;
        if (newLength === currentLength) return;
        else if (newLength > currentLength) this.splice(currentLength, 0, new Array(newLength - currentLength));
        else this.splice(newLength, currentLength - newLength);
    }

    clear(): T[] {
        return this.splice(0);
    }

    concat(...arrays: T[][]): T[] {
        this.$atom.markUsage();
        return Array.prototype.concat.apply(
            this.$bobx,
            arrays.map(a => (isObservableArray(a) ? ((a as any) as ObservableArray<T>).$bobx : a))
        );
    }

    replace(newItems: T[]) {
        this.$atom.invalidate();

        return this.splice(0, this.$bobx.length, newItems);
    }

    /**
     * Converts this array back to a (shallow) javascript structure.
     */
    toJS(): T[] {
        return (this as any).slice();
    }

    toJSON(): T[] {
        // Used by JSON.stringify
        return this.$bobx;
    }

    find(
        predicate: (item: T, index: number, array: ObservableArray<T>) => boolean,
        thisArg?: any,
        fromIndex = 0
    ): T | undefined {
        this.$atom.markUsage();
        const values = this.$bobx,
            l = values.length;
        for (let i = fromIndex; i < l; i++) if (predicate.call(thisArg, values[i], i, this)) return values[i];
        return undefined;
    }

    push(...items: T[]): number {
        const values = this.$bobx;
        if (items.length == 0) return values.length;
        for (let i = 0; i < items.length; i++) {
            items[i] = this.$enhancer(items[i], undefined);
        }
        values.push.apply(values, items);
        this.$atom.invalidate();
        reserveArrayBuffer(values.length);
        return values.length;
    }

    pop(): T | undefined {
        return this.splice(Math.max(this.$bobx.length - 1, 0), 1)[0];
    }

    shift(): T | undefined {
        return this.splice(0, 1)[0];
    }

    unshift(...items: T[]): number {
        this.splice(0, 0, items);
        return this.$bobx.length;
    }

    reverse(): T[] {
        this.$atom.invalidate();
        let values = this.$bobx;
        values.reverse.apply(values, arguments as any);
        return this as any;
    }

    sort(_compareFn?: (a: T, b: T) => number): T[] {
        this.$atom.invalidate();
        let values = this.$bobx;
        values.sort.apply(values, arguments as any);
        return this as any;
    }

    remove(value: T): boolean {
        const idx = this.$bobx.indexOf(value);
        if (idx > -1) {
            this.splice(idx, 1);
            return true;
        }
        return false;
    }

    private checkIndex(index: number) {
        if (index < 0) {
            throw new Error(`Array index out of bounds: ${index} is negative`);
        }
        const length = this.$bobx.length;
        if (index >= length) {
            throw new Error(`Array index out of bounds: ${index} is not smaller than ${length}`);
        }
    }

    move(fromIndex: number, toIndex: number): void {
        this.checkIndex(fromIndex);
        this.checkIndex(toIndex);
        if (fromIndex === toIndex) {
            return;
        }
        const oldItems = this.$bobx;
        let newItems: T[];
        if (fromIndex < toIndex) {
            newItems = [
                ...oldItems.slice(0, fromIndex),
                ...oldItems.slice(fromIndex + 1, toIndex + 1),
                oldItems[fromIndex],
                ...oldItems.slice(toIndex + 1)
            ];
        } else {
            // toIndex < fromIndex
            newItems = [
                ...oldItems.slice(0, toIndex),
                oldItems[fromIndex],
                ...oldItems.slice(toIndex, fromIndex),
                ...oldItems.slice(fromIndex + 1)
            ];
        }
        this.replace(newItems);
    }

    toString(): string {
        this.$atom.markUsage();
        return Array.prototype.toString.apply(this.$bobx, arguments as any);
    }
}

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
    get: function(this: ObservableArray<any>): number {
        this.$atom.markUsage();
        return this.$bobx.length;
    },
    set: function(this: ObservableArray<any>, newLength: number) {
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
].forEach(funcName => {
    const baseFunc = (Array.prototype as any)[funcName];
    addHiddenProp(ObservableArray.prototype, funcName, function(this: ObservableArray<any>) {
        this.$atom.markUsage();
        return baseFunc.apply(this.$bobx, arguments);
    });
});

const ENTRY_0 = {
    configurable: true,
    enumerable: false,
    set: createArraySetter(0),
    get: createArrayGetter(0)
};

function createArrayBufferItem(index: number) {
    const set = createArraySetter(index);
    const get = createArrayGetter(index);
    Object.defineProperty(ObservableArray.prototype, "" + index, {
        enumerable: false,
        configurable: true,
        set,
        get
    });
}

function createArraySetter(index: number) {
    return function<T>(this: ObservableArray<any>, newValue: T) {
        const values = this.$bobx;
        if (index < values.length) {
            // update at index in range
            const oldValue = values[index];
            newValue = this.$enhancer(newValue, oldValue);
            const changed = newValue !== oldValue;
            if (changed) {
                this.$atom.invalidate();
                values[index] = newValue;
            }
        } else if (index === values.length) {
            // add a new item
            this.push(newValue);
        } else throw new Error(`Array index out of bounds, ${index} is larger than ${values.length}`);
    };
}

function createArrayGetter(index: number) {
    return function(this: ObservableArray<any>) {
        const values = this.$bobx;
        this.$atom.markUsage();
        if (index < values.length) {
            return values[index];
        }
        return undefined;
    };
}

function reserveArrayBuffer(max: number) {
    max++;
    if (observableArrayPropCount >= max) return;
    max = Math.max(Math.ceil(observableArrayPropCount * 1.5), max);
    for (let index = observableArrayPropCount; index < max; index++) createArrayBufferItem(index);
    observableArrayPropCount = max;
}

reserveArrayBuffer(100);

export function isObservableArray(thing: any): thing is IObservableArray<any> {
    return isObject(thing) && b.isArray(thing.$bobx);
}

function isArrayLike(thing: any): thing is any[] {
    return b.isArray(thing) || isObservableArray(thing);
}

b.setIsArrayVdom(isArrayLike);

const ObservableMapMarker = 0;
const ComputedMarker = 1;

export function isObservableMap(thing: any): thing is IObservableMap<any, any> {
    return isObject(thing) && thing.$bobx === ObservableMapMarker;
}

export interface IMap<K, V> {
    clear(): void;
    delete(key: K): boolean;
    forEach(callbackfn: (value: V, key: K, map: IMap<K, V>) => void, thisArg?: any): void;
    get(key: K): V | undefined;
    has(key: K): boolean;
    set(key: K, value: V): this;
    readonly size: number;
}

export interface IKeyValueMap<V> {
    [key: string]: V;
}

export type IMapEntry<K, V> = [K, V];

export type IMapEntries<K, V> = IMapEntry<K, V>[];

export interface IObservableMap<K, V> extends IMap<K, V> {
    prop(key: K): b.IProp<V>;
}

export type IObservableMapInitialValues<K, V> = IMapEntries<K, V> | IKeyValueMap<V> | IMap<K, V> | Map<K, V>;

export class ObservableMap<K, V> implements IObservableMap<K, V> {
    _size: number;

    get size(): number {
        this.$atom.markUsage();
        return this._size;
    }
    $bobx!: 0;
    $enhancer: IEnhancer<V>;
    $atom: ObservableValue<any>;
    $content: IMap<K, ObservableValue<V>>;

    constructor(init: IObservableMapInitialValues<K, V> | null | undefined, enhancer: IEnhancer<V>) {
        this.$enhancer = enhancer;
        this.$atom = new ObservableValue<any>(null, referenceEnhancer);
        this.$content = new Map();
        this._size = 0;
        if (Array.isArray(init)) init.forEach(([key, value]) => this.set(key, value));
        else if (isObservableMap(init) || isES6Map(init)) {
            (init as IMap<K, V>).forEach(function(this: ObservableMap<K, V>, value: V, key: K) {
                this.set(key, value);
            }, this);
        } else if (isPlainObject(init)) {
            const keys = Object.keys(init);
            for (var i = 0; i < keys.length; i++) {
                const key = keys[i];
                this.set((key as any) as K, (init as IKeyValueMap<V>)[key]);
            }
        } else if (init != null) throw new Error("Cannot initialize map from " + init);
    }

    has(key: K): boolean {
        let cont = this.$content.get(key);
        if (cont !== undefined) {
            cont.markUsage();
            return true;
        }
        this.$atom.markUsage();
        return false;
    }

    get(key: K): V | undefined {
        let cont = this.$content.get(key);
        if (cont !== undefined) {
            return cont.get();
        }
        this.$atom.markUsage();
        return undefined;
    }

    set(key: K, value: V): this {
        let cont = this.$content.get(key);
        if (cont !== undefined) {
            cont.set(value);
            return this;
        }
        this.$atom.invalidate();
        this.$content.set(key, new ObservableValue(value, this.$enhancer));
        this._size++;
        return this;
    }

    prop(key: K): b.IProp<V> {
        let cont = this.$content.get(key);
        if (cont !== undefined) {
            cont.markUsage();
            return cont.prop();
        }
        this.$atom.markUsage();
        return (value?: V) => {
            if (value === undefined) {
                return this.get(key)!;
            }
            this.set(key, value);
            return this.get(key)!;
        };
    }

    clear(): void {
        if (this._size == 0) return;
        let c = this.$content;
        c.forEach(v => v.invalidate());
        this.$atom.invalidate();
        this._size = 0;
        this.$content.clear();
    }

    delete(key: K): boolean {
        this.$atom.invalidate();
        let cont = this.$content.get(key);
        if (cont !== undefined) {
            cont.invalidate();
            this.$content.delete(key);
            this._size--;
            return true;
        }
        return false;
    }

    forEach(callbackfn: (value: V, index: K, map: IObservableMap<K, V>) => void, thisArg?: any): void {
        this.$atom.markUsage();
        this.$content.forEach(function(this: ObservableMap<K, V>, value: ObservableValue<V>, key: K) {
            callbackfn.call(thisArg, value.get(), key, this);
        }, this);
    }

    toJSON() {
        var res = Object.create(null);
        this.$content.forEach(function(this: any, v: ObservableValue<V>, k: K) {
            this[k] = v.get();
        }, res);
        return res;
    }
}

addHiddenFinalProp(ObservableMap.prototype, "$bobx", ObservableMapMarker);

function deepEnhancer<T>(newValue: T, oldValue: T | undefined): T {
    if (newValue === oldValue) return oldValue;
    if (newValue == null) return newValue;
    if (isObservable(newValue)) return newValue;
    if (b.isArray(newValue)) return new ObservableArray(newValue as any, deepEnhancer) as any;
    if (isES6Map(newValue)) return new ObservableMap(newValue, deepEnhancer) as any;
    if (isPlainObject(newValue)) {
        let res = Object.create(Object.getPrototypeOf(newValue));
        let behind = asObservableObject(res);
        for (let key in newValue as IKeyValueMap<any>) {
            defineObservableProperty(res, behind, key, (newValue as IKeyValueMap<any>)[key], deepEnhancer);
        }
        return res;
    }
    return newValue;
}

function shallowEnhancer<T>(newValue: T, oldValue: T | undefined): T {
    if (newValue === oldValue) return oldValue;
    if (newValue == null) return newValue;
    if (isObservable(newValue)) return newValue;
    if (b.isArray(newValue)) return new ObservableArray(newValue as any, referenceEnhancer) as any;
    if (isES6Map(newValue)) return new ObservableMap(newValue, referenceEnhancer) as any;
    if (isPlainObject(newValue)) {
        let res = Object.create(Object.getPrototypeOf(newValue));
        let behind = asObservableObject(res);
        for (let key in newValue as IKeyValueMap<any>) {
            defineObservableProperty(res, behind, key, (newValue as IKeyValueMap<any>)[key], referenceEnhancer);
        }
        return res;
    }
    throw new Error("shallow observable cannot be used for primitive values");
}

function deepStructEnhancer<T>(newValue: T, oldValue: T | undefined): T {
    if (deepEqual(newValue, oldValue)) return oldValue!;
    if (newValue == null) return newValue;
    if (isObservable(newValue)) return newValue;
    if (b.isArray(newValue)) return new ObservableArray(newValue as any, deepStructEnhancer) as any;
    if (isES6Map(newValue)) return new ObservableMap(newValue, deepStructEnhancer) as any;
    if (isPlainObject(newValue)) {
        let res = Object.create(Object.getPrototypeOf(newValue));
        let behind = asObservableObject(res);
        for (let key in newValue as IKeyValueMap<any>) {
            defineObservableProperty(res, behind, key, (newValue as IKeyValueMap<any>)[key], deepStructEnhancer);
        }
        return res;
    }

    return newValue;
}

function refStructEnhancer<T>(newValue: T, oldValue: T | undefined): T {
    if (deepEqual(newValue, oldValue)) return oldValue!;
    return newValue;
}

const deepDecorator = createDecoratorForEnhancer(deepEnhancer);
const shallowDecorator = createDecoratorForEnhancer(shallowEnhancer);
const refDecorator = createDecoratorForEnhancer(referenceEnhancer);
const deepStructDecorator = createDecoratorForEnhancer(deepStructEnhancer);
const refStructDecorator = createDecoratorForEnhancer(refStructEnhancer);

const LazyClass = {};
const $atomId = "$atomId";

export function initObservableClassPrototype(target: any) {
    // target is actually prototype not instance
    if (Object.getOwnPropertyDescriptor(target.constructor, $atomId) === undefined) {
        Object.defineProperty(target.constructor, $atomId, {
            enumerable: false,
            writable: false,
            configurable: false,
            value: allocId()
        });
    }
    if (!("$bobx" in target)) {
        Object.defineProperty(target, "$bobx", {
            enumerable: false,
            writable: true,
            configurable: true,
            value: LazyClass
        });
        if (!("toJSON" in target)) {
            target.toJSON = function(this: IAtom) {
                return this.$bobx;
            };
        }
    }
}

function createDecoratorForEnhancer(enhancer: IEnhancer<any>) {
    return function classPropertyDecorator(target: any, propName: string, _descriptor: PropertyDescriptor) {
        initObservableClassPrototype(target);
        return {
            configurable: true,
            enumerable: false,
            get: function(this: IAtom) {
                let val = this.$bobx[propName];
                if (val === undefined) {
                    let behind = asObservableClass(this);
                    val = new ObservableValue(undefined, enhancer);
                    behind[propName] = val;
                }
                return val.get();
            },
            set: function(this: IAtom, value: any) {
                let val = this.$bobx[propName];
                if (val === undefined) {
                    let behind = asObservableClass(this);
                    val = new ObservableValue(value, enhancer);
                    behind[propName] = val;
                } else {
                    val.set(value);
                }
            }
        };
    };
}

export interface IObservableFactory {
    // observable overloads
    <T>(): IObservableValue<T>;
    (target: Object, key: string, baseDescriptor?: PropertyDescriptor): any;
    <T>(value: T[]): IObservableArray<T>;
    (value: string): IObservableValue<string>;
    (value: boolean): IObservableValue<boolean>;
    (value: number): IObservableValue<number>;
    (value: Date): IObservableValue<Date>;
    (value: RegExp): IObservableValue<RegExp>;
    (value: Function): IObservableValue<Function>;
    <T>(value: null | undefined): IObservableValue<T>;
    (value: null | undefined): IObservableValue<any>;
    (): IObservableValue<any>;
    <K, V>(value: IMap<K, V>): IObservableMap<K, V>;
    <T extends Object>(value: T): T;
    <T>(value: T): IObservableValue<T>;
}

export interface IObservableFactories {
    map<K, V>(init?: IObservableMapInitialValues<K, V>): IObservableMap<K, V>;

    shallowMap<K, V>(init?: IObservableMapInitialValues<K, V>): IObservableMap<K, V>;

    /**
     * Decorator that creates an observable that only observes the references, but doesn't try to turn the assigned value into an observable.
     */
    ref(target: Object, property: string, descriptor?: PropertyDescriptor): any;

    /**
     * Decorator that creates an observable converts its value (objects, maps or arrays) into a shallow observable structure
     */
    shallow(target: Object, property: string, descriptor?: PropertyDescriptor): any;

    deep(target: Object, property: string, descriptor?: PropertyDescriptor): any;

    struct(target: Object, property: string, descriptor?: PropertyDescriptor): any;
}

function createObservable(value: any = undefined): IObservableValue<any> {
    // @observable someProp;
    if (arguments.length > 1) return deepDecorator.apply(null, arguments as any) as any;

    // it is an observable already, done
    if (isObservable(value)) return value;

    // something that can be converted and mutated?
    const res = deepEnhancer(value, undefined);

    // this value could be converted to a new observable data structure, return it
    if (res !== value) return res;

    return new ObservableValue(value, deepEnhancer);
}

export var observable: IObservableFactory &
    IObservableFactories & {
        deep: {
            struct(target: Object, property: string, descriptor?: PropertyDescriptor): any;
        };
        ref: {
            struct(target: Object, property: string, descriptor?: PropertyDescriptor): any;
        };
    } = createObservable as any;

observable.map = ((init: IObservableMapInitialValues<any, any>) => new ObservableMap(init, deepEnhancer)) as any;
observable.shallowMap = ((init: IObservableMapInitialValues<any, any>) =>
    new ObservableMap(init, referenceEnhancer)) as any;
observable.deep = deepDecorator as any;
observable.ref = refDecorator as any;
observable.shallow = shallowDecorator;
observable.struct = deepStructDecorator;
observable.deep.struct = deepStructDecorator;
observable.ref.struct = refStructDecorator;

let bobxRootCtx: b.IBobrilCacheNode | undefined = undefined;

b.addRoot(root => {
    bobxRootCtx = root.n;
    return undefined;
});

let buryDeadSet: Set<IBobxComputed> = new Set();
let updateNextFrameList: IBobxComputed[] = [];

export let maxIterations = 100;

const previousReallyBeforeFrame = b.setReallyBeforeFrame(() => {
    frameStart = b.now();
    if (!alreadyInterrupted) {
        buryWholeDeadSet();
    }
    alreadyInterrupted = false;
    outsideOfComputedPartialResults = false;
    firstInterruptibleCtx = undefined;
    let iteration = 0;
    while (iteration++ < maxIterations) {
        let list = updateNextFrameList;
        if (list.length == 0) break;
        updateNextFrameList = [];
        for (let i = 0; i < list.length; i++) {
            list[i].updateIfNeeded();
        }
    }
    if (iteration >= maxIterations) {
        throw new Error("Computed values did not stabilize after " + maxIterations + " iterations");
    }
    previousReallyBeforeFrame();
});
export type IEqualsComparer<T> = (o: T, n: T) => boolean;

export const enum ComputedState {
    First,
    NeedRecheck,
    Updating,
    Updated,
    Scope
}

export class CaughtException {
    constructor(public cause: any) {}
}

function buryWholeDeadSet() {
    if (buryDeadSet.size > 0) {
        buryDeadSet.forEach(v => {
            v.buryIfDead();
        });
        buryDeadSet.clear();
    }
}

export function isCaughtException(e: any): e is CaughtException {
    return e instanceof CaughtException;
}

export class ComputedImpl implements IBobxComputed {
    fn: Function;
    that: any;
    atomId: AtomId;
    $bobx!: 1;
    value: any;
    state: ComputedState;
    partialResults: boolean;
    onInvalidated?: (that: IBobxComputed) => void;

    comparator: IEqualsComparer<any>;

    usedBy: Map<AtomId, IBobxComputed> | undefined;
    ctxs: Map<CtxId, IBobXBobrilCtx> | undefined;

    using: Map<AtomId, IAtom> | undefined;

    markUsing(atomId: AtomId, atom: IAtom): boolean {
        let using = this.using;
        if (using === undefined) {
            using = new Map();
            using.set(atomId, atom);
            this.using = using;
            return true;
        }
        if (using.has(atomId)) return false;
        using.set(atomId, atom);
        return true;
    }

    invalidateBy(atomId: AtomId): void {
        let using = this.using;
        if (using === undefined) return;
        if (using.delete(atomId)) {
            let state = this.state;
            if (state === ComputedState.Updating) {
                throw new Error("Modifying inputs during updating computed");
            }
            if (state === ComputedState.Updated) {
                if (DEBUG) {
                    var i = this.onInvalidated;
                    if (i) i(this);
                }
                this.state = ComputedState.NeedRecheck;
                if (this.ctxs !== undefined || this.usedBy !== undefined) {
                    if (updateNextFrameList.length == 0) b.invalidate(bobxRootCtx);
                    updateNextFrameList.push(this);
                }
            }
            this.freeUsings();
        }
    }

    freeUsings() {
        let using = this.using;
        if (using !== undefined) {
            this.using = undefined;
            using.forEach(v => {
                if (isIBobxComputed(v)) {
                    v.unmarkUsedBy(this.atomId);
                } else {
                    (v as ObservableValue<any>).ctxs!.delete(this.atomId);
                }
            });
        }
    }

    free(): void {
        let using = this.using;
        if (using !== undefined) {
            this.using = undefined;
            using.forEach(v => {
                if (isIBobxComputed(v)) {
                    v.unmarkUsedBy(this.atomId);
                    v.buryIfDead();
                } else {
                    (v as ObservableValue<any>).ctxs!.delete(this.atomId);
                }
            });
        }
    }

    buryIfDead(): void {
        if ((this.usedBy !== undefined && this.usedBy.size > 0) || (this.ctxs !== undefined && this.ctxs.size > 0)) {
            return;
        }
        buryDeadSet.delete(this);
        this.state = ComputedState.First;
        this.free();
    }

    constructor(fn: Function, that: any, comparator: IEqualsComparer<any>) {
        this.atomId = allocId();
        this.fn = fn;
        this.that = that;
        this.ctxs = undefined;
        this.value = undefined;
        this.state = ComputedState.First;
        this.comparator = comparator;
        this.using = undefined;
        this.usedBy = undefined;
        this.partialResults = false;
    }

    unmarkUsedBy(atomId: AtomId): void {
        this.usedBy!.delete(atomId);
        if (this.usedBy!.size === 0 && (this.ctxs === undefined || this.ctxs.size === 0)) {
            buryDeadSet.add(this);
        }
    }

    unmarkCtx(ctxId: AtomId): void {
        this.ctxs!.delete(ctxId);
        if (this.ctxs!.size === 0 && (this.usedBy === undefined || this.usedBy.size === 0)) {
            buryDeadSet.add(this);
        }
    }

    markUsage() {
        const ctx = b.getCurrentCtx() as IBobxCallerCtx;
        if (ctx === undefined)
            // outside of render => nothing to mark
            return;
        if (isIBobxComputed(ctx)) {
            if (ctx.markUsing(this.atomId, this)) {
                let ctxs = this.usedBy;
                if (ctxs === undefined) {
                    ctxs = new Map();
                    this.usedBy = ctxs;
                }
                ctxs.set(ctx.atomId, ctx);
            }
        } else {
            let bobx = ctx.$bobxCtx;
            if (bobx === undefined) {
                bobx = new Map();
                bobx.ctxId = allocId();
                ctx.$bobxCtx = bobx;
            }
            if (bobx.has(this.atomId)) return;
            bobx.set(this.atomId, this);
            if (this.ctxs === undefined) {
                this.ctxs = new Map();
            }
            this.ctxs!.set(bobx.ctxId!, ctx);
        }
    }

    invalidate() {
        const ctxs = this.ctxs;
        if (ctxs !== undefined) {
            ctxs.forEach(function(this: ComputedImpl, ctx) {
                ctx.$bobxCtx!.delete(this.atomId);
                b.invalidate(ctx);
            }, this);
            ctxs.clear();
        }
        const usedBy = this.usedBy;
        if (usedBy !== undefined) {
            usedBy.forEach(function(this: ComputedImpl, use) {
                use.invalidateBy(this.atomId);
            }, this);
            usedBy.clear();
        }
        buryDeadSet.add(this);
    }

    updateIfNeeded() {
        if (this.state === ComputedState.NeedRecheck) this.update();
    }

    call(): any {
        try {
            return this.fn.call(this.that);
        } catch (err) {
            return new CaughtException(err);
        }
    }

    update(): void {
        if (alreadyInterrupted && this.partialResults) {
            setPartialResults();
            return;
        }
        let backupCurrentCtx = b.getCurrentCtx();
        b.setCurrentCtx(this as any);
        this.partialResults = false;
        if (this.state === ComputedState.First) {
            this.state = ComputedState.Updating;
            this.value = this.call();
        } else {
            this.state = ComputedState.Updating;
            let newResult = this.call();
            if (!this.comparator(this.value, newResult)) {
                this.value = newResult;
                this.invalidate();
            }
        }

        this.partialResults = alreadyInterrupted;
        this.state = ComputedState.Updated;
        b.setCurrentCtx(backupCurrentCtx);
        if (this.partialResults) {
            this.state = ComputedState.NeedRecheck;
            setPartialResults();
        }
    }

    run() {
        if (this.state === ComputedState.Updating) {
            throw new Error("Recursively calling computed value");
        }
        this.markUsage();
        if (this.state !== ComputedState.Updated) {
            this.update();
            if (b.getCurrentCtx() === undefined) {
                this.buryIfDead();
            }
        }
        let value = this.value;
        if (isCaughtException(value)) throw value.cause;
        return value;
    }
}

addHiddenFinalProp(ComputedImpl.prototype, "$bobx", ComputedMarker);

export function getStringHashCode(s: string): number {
    var h = 0,
        l = s.length,
        i = 0;
    while (i < l) h = ((h << 5) - h + s.charCodeAt(i++)) | 0;
    return h;
}

const hashes = new WeakMap<any, number>();

export function getObjectHashCode(value: any): number {
    let result = hashes.get(value);
    if (result !== undefined) return result;
    result = allocId() | 0;
    hashes.set(value, result);
    return result;
}

export function getHashCode(value: any): number {
    if (value == undefined) return 1;
    if (value === false) return 2;
    if (value === true) return 3;
    if (b.isNumber(value)) return value | 0;
    if (b.isString(value)) return getStringHashCode(value);
    return getObjectHashCode(value);
}

export interface IComputedOptions<Params, Output> {
    getHashCode?(params: Params): number;
    isEqual?(a: Params, b: Params): boolean;
    onFree?(output: Output | undefined, params: Params): void;
    comparator?: IEqualsComparer<Output>;
}

const defaultComputedOptions: IComputedOptions<any[], any> = {
    getHashCode(params: any[]): number {
        var h = 0,
            l = params.length,
            i = 0;
        while (i < l) h = ((h << 5) - h + getHashCode(params[i++])) | 0;
        return h;
    },
    isEqual(a: any[], b: any[]): boolean {
        var l = a.length;
        if (l !== b.length) return false;
        for (var i = 0; i < l; i++) {
            if (!equalsIncludingNaN(a[i], b[i])) return false;
        }
        return true;
    },
    comparator: equalsIncludingNaN
};

export interface IComputedFactory {
    (target: any, propName: string, descriptor: PropertyDescriptor): TypedPropertyDescriptor<any>;
    struct: (target: any, propName: string, descriptor: PropertyDescriptor) => TypedPropertyDescriptor<any>;
    equals<T>(
        comparator: IEqualsComparer<T>
    ): (target: any, propName: string, descriptor: TypedPropertyDescriptor<any>) => TypedPropertyDescriptor<any>;
    customized(
        options: IComputedOptions<any[], any>
    ): (
        target: any,
        propName: string,
        descriptor: TypedPropertyDescriptor<(...params: any[]) => any>
    ) => TypedPropertyDescriptor<(...params: any[]) => any>;
}

function buildComputed<T>(comparator: IEqualsComparer<T>) {
    return (target: any, propName: string, descriptor: PropertyDescriptor): TypedPropertyDescriptor<any> => {
        initObservableClassPrototype(target);
        propName = propName + "\t" + target.constructor[$atomId];
        if (descriptor.get != undefined) {
            const fn = descriptor.get;
            return {
                configurable: true,
                enumerable: false,
                get: function(this: IAtom) {
                    let val: ComputedImpl | undefined = this.$bobx[propName];
                    if (val === undefined) {
                        let behind = asObservableClass(this);
                        val = new ComputedImpl(fn, this, comparator);
                        (behind as any)[propName] = val;
                    }
                    return val.run();
                },
                set: descriptor.set
            };
        } else {
            const fn = descriptor.value;
            assertFunctionInComputed(fn);
            if (fn.length > 0) {
                return buildParametricCompute<T>(propName, fn, { comparator });
            }
            return {
                configurable: true,
                enumerable: false,
                value: function(this: IAtom) {
                    let val: ComputedImpl | undefined = this.$bobx[propName];
                    if (val === undefined) {
                        let behind = asObservableClass(this);
                        val = new ComputedImpl(fn, this, comparator);
                        (behind as any)[propName] = val;
                    }
                    return val.run();
                }
            };
        }
    };
}

function assertFunctionInComputed(fn: any) {
    if (!b.isFunction(fn)) {
        throw new Error("Computed could be only function");
    }
}

function buildCustomizedComputed<T>(options: IComputedOptions<any[], any>) {
    return (target: any, propName: string, descriptor: PropertyDescriptor): TypedPropertyDescriptor<any> => {
        initObservableClassPrototype(target);
        propName = propName + "\t" + target.constructor[$atomId];
        if (descriptor.get != undefined) {
            throw new Error("Customized Computed could not be property");
        } else {
            const fn = descriptor.value;
            assertFunctionInComputed(fn);
            return buildParametricCompute<T>(propName, fn, options);
        }
    };
}

export var computed: IComputedFactory = buildComputed(equalsIncludingNaN) as any;
computed.struct = buildComputed(deepEqual);
computed.equals = buildComputed;
computed.customized = buildCustomizedComputed;

const arraySlice = Array.prototype.slice;

function buildParametricCompute<T>(
    propName: string,
    fn: Function,
    options: IComputedOptions<any[], T>
): TypedPropertyDescriptor<any> {
    return {
        configurable: true,
        enumerable: false,
        value: function(this: IAtom) {
            let val: ParametricComputedMap | undefined = this.$bobx[propName];
            if (val === undefined) {
                let behind = asObservableClass(this);
                val = new ParametricComputedMap(fn, this, options);
                (behind as any)[propName] = val;
            }
            return val.run(arraySlice.call(arguments));
        }
    };
}

class ParamComputedImpl extends ComputedImpl {
    owner: ParametricComputedMap;
    hashCode: number;
    params: any[];

    constructor(
        fn: Function,
        that: any,
        comparator: IEqualsComparer<any>,
        owner: ParametricComputedMap,
        hashCode: number,
        params: any[]
    ) {
        super(fn, that, comparator);
        this.owner = owner;
        this.hashCode = hashCode;
        this.params = params;
    }

    call(): any {
        try {
            return this.fn.apply(this.that, this.params);
        } catch (err) {
            return new CaughtException(err);
        }
    }

    free() {
        super.free();
        this.owner.free(this);
    }
}

export class ParametricComputedMap {
    fn: Function;
    that: any;
    map: Map<number, ParamComputedImpl[]>;
    getHashCode: (params: any[]) => number;
    isEqual: (a: any[], b: any[]) => boolean;
    onFree?: (output: any | undefined, params: any[]) => void;
    comparator: IEqualsComparer<any>;

    constructor(fn: Function, that: any, options: IComputedOptions<any[], any>) {
        this.fn = fn;
        this.that = that;
        this.map = new Map();
        this.getHashCode = options.getHashCode || defaultComputedOptions.getHashCode!;
        this.isEqual = options.isEqual || defaultComputedOptions.isEqual!;
        this.onFree = options.onFree;
        this.comparator = options.comparator || defaultComputedOptions.comparator!;
    }

    run(params: any[]) {
        const hashCode = this.getHashCode(params);
        let row = this.map.get(hashCode);
        let item: ParamComputedImpl | undefined = undefined;
        if (row === undefined) {
            item = new ParamComputedImpl(this.fn, this.that, this.comparator, this, hashCode, params);
            row = [item];
            this.map.set(hashCode, row);
        } else {
            const len = row.length;
            for (var i = 0; i < len; i++) {
                if (this.isEqual(params, row[i].params)) {
                    item = row[i];
                    break;
                }
            }
            if (item === undefined) {
                item = new ParamComputedImpl(this.fn, this.that, this.comparator, this, hashCode, params);
                row.push(item);
            }
        }
        return item.run();
    }

    free(item: ParamComputedImpl) {
        const hashCode = item.hashCode;
        const row = this.map.get(hashCode)!;
        if (row.length == 1) {
            this.map.delete(hashCode);
        } else {
            const index = row!.indexOf(item);
            row.splice(index, 1);
        }
        if (this.onFree !== undefined) {
            let target = item.value;
            if (isCaughtException(target)) target = undefined;
            this.onFree(target, item.params);
        }
    }
}

export function observableProp<T>(obj: Array<T>, key: number): b.IProp<T>;
export function observableProp<T, K extends keyof T>(obj: T, key: K): b.IProp<T[K]>;
export function observableProp<T, K extends keyof T>(obj: T, key: K): b.IProp<T[K]> {
    if (obj == null) throw new Error("observableProp parameter is " + obj);
    let bobx = ((obj as any) as IAtom).$bobx;
    if (bobx === undefined) throw new Error("observableProp parameter is not observable: " + obj);
    if (bobx === ObservableMapMarker) throw new Error("observableProp parameter is observableMap");
    if (b.isArray(bobx)) {
        // Does this pays off to cache and/or inline?
        return (value?: any) => {
            if (value !== undefined) {
                obj[key] = value;
            }
            return obj[key];
        };
    }
    if (Object.getPrototypeOf(bobx) === undefined) {
        return (bobx[key] as ObservableValue<T[K]>).prop();
    }
    bobx = asObservableClass(obj);
    let val = bobx[key];
    if (val === undefined) {
        obj[key]; // Has side effect to create ObservableValue
        val = bobx[key]!;
    }
    return val.prop();
}

var frameStart = b.now();
var outsideOfComputedPartialResults = false;
var alreadyInterrupted = false;
var firstInterruptibleCtx: IBobxCallerCtx | undefined;
var timeBudget = 10;

export function setTimeBudget(value: number) {
    timeBudget = value;
}

export function getTimeBudget(): number {
    return timeBudget;
}

var haveTimeBudget: () => boolean = () => b.now() - frameStart < timeBudget; // Spend only first 10ms from each frame in computed methods.

export function resetGotPartialResults() {
    const ctx = b.getCurrentCtx() as IBobxCallerCtx;
    if (ctx !== undefined && isIBobxComputed(ctx)) {
        throw new Error("resetGotPartialResults cannot be called from computed method");
    }
    outsideOfComputedPartialResults = false;
}

function setPartialResults(): void {
    const ctx = b.getCurrentCtx() as IBobxCallerCtx;
    if (ctx !== undefined) {
        if (isIBobxComputed(ctx)) {
            ctx.partialResults = true;
        } else {
            b.invalidate(ctx);
        }
    }
    outsideOfComputedPartialResults = true;
}

export function gotPartialResults(): boolean {
    const ctx = b.getCurrentCtx() as IBobxCallerCtx;
    if (ctx !== undefined && isIBobxComputed(ctx)) {
        return ctx.partialResults;
    }
    return outsideOfComputedPartialResults;
}

export function interrupted(): boolean {
    if (alreadyInterrupted) return true;
    const ctx = b.getCurrentCtx() as IBobxCallerCtx;
    if (firstInterruptibleCtx === undefined) firstInterruptibleCtx = ctx;
    if (gotPartialResults()) {
        return true;
    }
    if (!haveTimeBudget()) {
        if (ctx === firstInterruptibleCtx) {
            return false;
        }
        if (ctx !== undefined && !isIBobxComputed(ctx)) {
            b.invalidate(ctx);
        }
        alreadyInterrupted = true;
        firstInterruptibleCtx = undefined;
        return true;
    }
    return false;
}

export function computedScope(
    computed: ComputedImpl,
    callBuryIfDead: boolean,
    continueCallback?: () => boolean
): boolean {
    let alreadyInterruptedBackup = alreadyInterrupted;
    let firstInterruptibleCtxBackup = firstInterruptibleCtx;
    let haveTimeBudgetBackup = haveTimeBudget;
    if (continueCallback != undefined) {
        haveTimeBudget = continueCallback;
        firstInterruptibleCtx = undefined;
        alreadyInterrupted = false;
    }
    computed.update();
    if (callBuryIfDead) {
        computed.buryIfDead();
        buryWholeDeadSet();
    }
    alreadyInterrupted = alreadyInterruptedBackup;
    firstInterruptibleCtx = firstInterruptibleCtxBackup;
    haveTimeBudget = haveTimeBudgetBackup;
    if (isCaughtException(computed.value)) throw computed.value.cause;
    return computed.partialResults;
}

export function reactiveScope(scope: () => void, continueCallback?: () => boolean): boolean {
    let computed = new ComputedImpl(
        () => {
            computed.state = ComputedState.Scope;
            scope();
        },
        undefined,
        equalsIncludingNaN
    );
    return computedScope(computed, true, continueCallback);
}

class TransformerComputedImpl extends ComputedImpl {
    transformerMap: Map<any, any>;
    onFree?: (target: any, source: any) => void;

    constructor(
        fn: Function,
        that: any,
        comparator: IEqualsComparer<any>,
        map: Map<any, any>,
        onFree?: (target: any, source: any) => void
    ) {
        super(fn, that, comparator);
        this.transformerMap = map;
        this.onFree = onFree;
    }

    free() {
        super.free();
        this.transformerMap.delete(this.that);
        if (this.onFree) {
            let target = this.value;
            if (isCaughtException(target)) target = undefined;
            this.onFree(target, this.that);
        }
    }
}

export function createTransformer<A, B>(
    factory: (source: A) => B,
    onFree?: (target: B | undefined, source: A) => void
): (source: A) => B {
    const factoryOnThis = function(this: A): B {
        return factory(this);
    };
    const map = new Map<A, ComputedImpl>();
    return (source: A) => {
        let computed = map.get(source);
        if (computed === undefined) {
            computed = new TransformerComputedImpl(factoryOnThis, source, equalsIncludingNaN, map, onFree);
            map.set(source, computed);
        }
        return computed.run();
    };
}

export function debugRunWhenInvalidated(fnc: () => void) {
    if (!DEBUG) return;
    const ctx = b.getCurrentCtx() as IBobxCallerCtx;
    if (isIBobxComputed(ctx)) {
        ctx.onInvalidated =
            fnc ||
            (() => {
                debugger;
            });
    } else {
        throw new Error("debugRunWhenInvalidated could be called only from computed");
    }
}
