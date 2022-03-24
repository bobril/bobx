import * as b from "bobril";

declare var DEBUG: boolean;

function equalsIncludingNaN(a: any, b: any) {
    return a === b || (a !== a && b !== b); // it correctly returns true for NaN and NaN
}

function addHiddenFinalProp(object: any, propName: string, value: any) {
    Object.defineProperty(object, propName, {
        enumerable: false,
        writable: false,
        configurable: true,
        value,
    });
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
    invalidateBy(atomId: AtomId): void;
    softInvalidate(): void;
    update(): void;
    updateIfNeeded(): void;
    updateIfNeededWithoutResurrecting(): void;
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
            p = (...value: [T?]) => {
                if (value.length === 0) {
                    return this.get();
                }
                this.set(value[0]!);
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
        ctxs.forEach(function (this: ObservableValue<T>, ctx) {
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
            bobx.forEach(function (this: IBobXInCtx, value: IAtom) {
                if (isIBobxComputed(value)) {
                    value.unmarkUsedBy(this.ctxId!);
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

const hOP = {}.hasOwnProperty;

const enhancerSymbol = Symbol("BobxEnhancer");
const voidObservableSymbol = Symbol("VoidObservable");

const ObjectProxyHandler: ProxyHandler<any> = {
    get(target: Record<string | symbol, ObservableValue<any>>, prop: string | symbol, _receiver: any) {
        if (b.isString(prop)) {
            if (prop === "$bobx") {
                return target;
            }
            if (!hOP.call(target, prop)) {
                if (prop in target) {
                    return target[prop];
                }

                let enhancer = target[enhancerSymbol] as any as IEnhancer<any>;
                let voidObservable = target[voidObservableSymbol] as any as ObservableValue<any>;
                if (voidObservable == undefined) {
                    voidObservable = new ObservableValue<any>(undefined, enhancer);
                    target[voidObservableSymbol] = voidObservable;
                }
                voidObservable.markUsage();
                return undefined;
            }
            return target[prop].get();
        }
        return undefined;
    },
    set(
        target: Record<string | symbol, ObservableValue<any>>,
        prop: string | symbol,
        value: any,
        _receiver: any
    ): boolean {
        if (b.isString(prop)) {
            if (prop === "$bobx") {
                return false;
            }
            if (!hOP.call(target, prop)) {
                let enhancer = target[enhancerSymbol] as any as IEnhancer<any>;
                let voidObservable = target[voidObservableSymbol] as any as ObservableValue<any>;
                if (voidObservable != undefined) {
                    voidObservable.invalidate();
                }
                let v = new ObservableValue<any>(value, enhancer);
                target[prop] = v;
                return true;
            }
            target[prop].set(value);
            return true;
        }
        return false;
    },
    ownKeys(target: Record<string | symbol, ObservableValue<any>>): Array<string | symbol> {
        return Object.getOwnPropertyNames(target);
    },
    defineProperty(): boolean {
        return false;
    },
    deleteProperty(target: Record<string | symbol, ObservableValue<any>>, prop: string | symbol): boolean {
        if (b.isString(prop)) {
            if (prop === "$bobx") {
                return false;
            }
            if (!hOP.call(target, prop)) {
                return true;
            }
            target[prop].invalidate();
            delete target[prop];
            return true;
        }
        return false;
    },
};

function createObservableObject(source: Object, enhancer: IEnhancer<any>): Object {
    let target = {} /*Object.create(Object.getPrototypeOf(source))*/ as any;
    target[enhancerSymbol] = enhancer;
    for (let key in source) {
        if (!hOP.call(source, key)) continue;
        target[key] = new ObservableValue((source as any)[key], enhancer);
    }
    return new Proxy(target, ObjectProxyHandler);
}

export function behindObservableClass(target: Object): Record<string, IObservableValue<any>> {
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

// ARRAY

export interface IObservableArray<T> extends Array<T> {
    clear(): this;
    replace(newItems: T[]): this;
    remove(value: T): boolean;
    move(fromIndex: number, toIndex: number): void;
}

const ArrayInternalSymbol = Symbol("BobxInternal");
/// Proxy, enhancer, atom
type InternalArrayMarker<T> = [
    IObservableArray<T>,
    IEnhancer<T>,
    ObservableValue<any>,
    Array<any> & InternalTargetArray<any>
];
type InternalTargetArray<T> = { [ArrayInternalSymbol]: InternalArrayMarker<T> };
const bobxArrayMethods = new Map<
    string,
    (this: IObservableArray<any> & InternalTargetArray<any>, ...args: any[]) => any
>();

bobxArrayMethods.set("push", function (this: InternalTargetArray<any>, ...items: any[]): number {
    const internal = this[ArrayInternalSymbol];
    const values = internal[3];
    const enhancer = internal[1];
    if (items.length == 0) return values.length;
    for (let i = 0; i < items.length; i++) {
        items[i] = enhancer(items[i]!, undefined);
    }
    values.push.apply(values, items);
    internal[2].invalidate(); // atom
    return values.length;
});

bobxArrayMethods.set(
    "splice",
    function (this: InternalTargetArray<any>, index?: number, deleteCount?: number, ...newItems: any[]): any[] {
        const internal = this[ArrayInternalSymbol];
        const values = internal[3];
        const enhancer = internal[1];

        const length = values.length;

        if (index === undefined) index = 0;
        else if (index > length) index = length;
        else if (index < 0) index = Math.max(0, length + index);

        if (arguments.length === 1) deleteCount = length - index;
        else if (deleteCount == null) deleteCount = 0;
        else deleteCount = Math.max(0, Math.min(deleteCount, length - index));

        if (newItems.length > 0 || deleteCount > 0) internal[2].invalidate();
        else internal[2].markUsage(); // atom

        for (let i = 0; i < newItems.length; i++) {
            newItems[i] = enhancer(newItems[i]!, undefined);
        }
        return values.splice(index, deleteCount, ...newItems);
    }
);

bobxArrayMethods.set("clear", function (this: InternalTargetArray<any>): any[] {
    return (this as any as IObservableArray<any>).splice(0);
});

bobxArrayMethods.set("unshift", function (this: InternalTargetArray<any>, ...items: any[]): number {
    (this as any as IObservableArray<any>).splice(0, 0, ...items);
    const internal = this[ArrayInternalSymbol];
    return internal[3].length;
});

bobxArrayMethods.set("remove", function (this: InternalTargetArray<any>, value: any): boolean {
    const idx = (this as any as IObservableArray<any>).indexOf(value);
    if (idx > -1) {
        (this as any as IObservableArray<any>).splice(idx, 1);
        return true;
    }
    return false;
});

bobxArrayMethods.set("move", function (this: InternalTargetArray<any>, fromIndex: number, toIndex: number): void {
    const oldItems = (this as any).$bobx as any[];

    function checkIndex(index: number) {
        if (index < 0) {
            throw new Error(`Array index out of bounds: ${index} is negative`);
        }
        const length = oldItems.length;
        if (index >= length) {
            throw new Error(`Array index out of bounds: ${index} is not smaller than ${length}`);
        }
    }

    checkIndex(fromIndex);
    checkIndex(toIndex);
    if (fromIndex === toIndex) {
        return;
    }
    let newItems: any[];
    if (fromIndex < toIndex) {
        newItems = [
            ...oldItems.slice(0, fromIndex),
            ...oldItems.slice(fromIndex + 1, toIndex + 1),
            oldItems[fromIndex]!,
            ...oldItems.slice(toIndex + 1),
        ];
    } else {
        // toIndex < fromIndex
        newItems = [
            ...oldItems.slice(0, toIndex),
            oldItems[fromIndex]!,
            ...oldItems.slice(toIndex, fromIndex),
            ...oldItems.slice(fromIndex + 1),
        ];
    }
    (this as any as IObservableArray<any>).replace(newItems);
});

bobxArrayMethods.set("fill", function (this: InternalTargetArray<any>, value: any, start?: number, end?: number): any {
    const internal = this[ArrayInternalSymbol];
    const values = internal[3];
    const enhancer = internal[1];
    value = enhancer(value, undefined);

    const length = values.length;

    start = start || 0;
    end = end === undefined ? length : end;

    let i;
    let l;

    if (start < 0) {
        i = Math.max(length + start, 0);
    } else {
        i = Math.min(start, length);
    }

    if (end < 0) {
        l = Math.max(length + end, 0);
    } else {
        l = Math.min(end, length);
    }

    if (i < l) {
        internal[2].invalidate();

        for (; i < l; i++) {
            values[i] = value;
        }
    }

    return this;
});

bobxArrayMethods.set("replace", function (this: InternalTargetArray<any>, newItems: any[]): any[] {
    return (this as any as IObservableArray<any>).splice(0, 1e10, ...newItems);
});

bobxArrayMethods.set("toJS", function (this: InternalTargetArray<any>): any[] {
    return (this as any).$bobx.slice();
});

bobxArrayMethods.set("toJSON", function (this: InternalTargetArray<any>): any[] {
    return (this as any).$bobx;
});

const ArrayProxyHandler: ProxyHandler<Array<any> & InternalTargetArray<any>> = {
    get(target: Array<any> & InternalTargetArray<any>, prop: string | symbol, _receiver: any) {
        if (b.isString(prop)) {
            var propIdx = +prop;
            if (!isNaN(propIdx)) {
                const internal = target[ArrayInternalSymbol];
                internal[2].markUsage();
                return target[prop as any];
            }
            if (prop === "length") {
                const internal = target[ArrayInternalSymbol];
                internal[2].markUsage();
                return target.length;
            }
            if (prop === "$bobx") {
                return target;
            }
            return bobxArrayMethods.get(prop);
        }
        return (target as { [name: string | symbol]: any })[prop];
    },
    set(target: Array<any> & InternalTargetArray<any>, prop: string | symbol, value: any, _receiver: any): boolean {
        if (b.isString(prop)) {
            var propIdx = +prop;
            if (!isNaN(propIdx)) {
                const internal = target[ArrayInternalSymbol];
                const oldValue = target[propIdx];
                value = internal[1](value, oldValue); // enhancer
                const changed = value !== oldValue;
                if (changed) {
                    internal[2].invalidate(); // atom
                    target[propIdx] = value;
                }
                return true;
            }
            if (prop === "length") {
                const internal = target[ArrayInternalSymbol];
                const oldValue = target.length;
                const changed = value !== oldValue;
                if (changed) {
                    internal[2].invalidate(); // atom
                    target.length = value;
                }
                return true;
            }
        }
        return false;
    },
};

function makeObservableArray<T>(target: Array<T>, enhancer: IEnhancer<T>): IObservableArray<T> {
    target = target.map((v) => enhancer(v, undefined));
    let internal = [
        new Proxy(target, ArrayProxyHandler) as IObservableArray<T>,
        enhancer,
        new ObservableValue<any>(null, referenceEnhancer),
        target,
    ] as const;
    Object.defineProperty(target, ArrayInternalSymbol, {
        value: internal,
        enumerable: false,
        writable: false,
        configurable: false,
    });
    return internal[0]; // proxy
}

// Wrap function from prototype
[
    "find",
    "findIndex",
    "concat",
    "every",
    "filter",
    "forEach",
    "includes",
    "indexOf",
    "flat",
    "join",
    "lastIndexOf",
    "map",
    "reduce",
    "reduceRight",
    "slice",
    "some",
    "keys",
    "values",
    "entries",
    "toString",
    "toLocaleString",
].forEach((funcName) => {
    const baseFunc = (Array.prototype as any)[funcName];
    bobxArrayMethods.set(funcName, function (this: InternalTargetArray<any>, ...args: any[]): any {
        const internal = this[ArrayInternalSymbol];
        internal[2].markUsage(); // atom
        return baseFunc.apply(internal[3], args); // values
    });
});

["pop", "shift"].forEach((funcName) => {
    const baseFunc = (Array.prototype as any)[funcName];
    bobxArrayMethods.set(funcName, function (this: InternalTargetArray<any>, ...args: any[]): any {
        const internal = this[ArrayInternalSymbol];
        internal[2].invalidate(); // atom
        return baseFunc.apply(internal[3], args); // values
    });
});

["reverse", "sort"].forEach((funcName) => {
    const baseFunc = (Array.prototype as any)[funcName];
    bobxArrayMethods.set(funcName, function (this: InternalTargetArray<any>, ...args: any[]): any {
        const internal = this[ArrayInternalSymbol];
        internal[2].invalidate(); // atom
        baseFunc.apply(internal[3], args); // values
        return this;
    });
});

export function isObservableArray(thing: any): thing is IObservableArray<any> {
    return b.isArray(thing) && (thing as any).$bobx !== undefined;
}

function isArrayLike<T>(
    thing: T | {}
): thing is T extends readonly any[] ? (unknown extends T ? never : readonly any[]) : any[] {
    return b.isArray(thing);
}

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
    keys(): IterableIterator<K>;
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
    get size(): number {
        this.$atom.markUsage();
        return this.$content.size;
    }
    $bobx!: 0;
    $enhancer: IEnhancer<V>;
    $atom: ObservableValue<any>;
    $content: IMap<K, ObservableValue<V>>;

    constructor(init: IObservableMapInitialValues<K, V> | null | undefined, enhancer: IEnhancer<V>) {
        this.$enhancer = enhancer;
        this.$atom = new ObservableValue<any>(null, referenceEnhancer);
        this.$content = new Map();
        if (Array.isArray(init)) init.forEach(([key, value]) => this.set(key, value));
        else if (isObservableMap(init) || isES6Map(init)) {
            (init as IMap<K, V>).forEach(function (this: ObservableMap<K, V>, value: V, key: K) {
                this.set(key, value);
            }, this);
        } else if (isPlainObject(init)) {
            const keys = Object.keys(init);
            for (var i = 0; i < keys.length; i++) {
                const key = keys[i]!;
                this.set(key as any as K, (init as IKeyValueMap<V>)[key]!);
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
        return this;
    }

    prop(key: K): b.IProp<V> {
        let cont = this.$content.get(key);
        if (cont !== undefined) {
            cont.markUsage();
            return cont.prop();
        }
        this.$atom.markUsage();
        return (...value: [V?]): V => {
            if (value.length === 0) {
                return this.get(key)!;
            }
            this.set(key, value[0]!);
            return this.get(key)!;
        };
    }

    clear(): void {
        let c = this.$content;
        if (c.size == 0) return;
        c.forEach((v) => v.invalidate());
        this.$atom.invalidate();
        this.$content.clear();
    }

    delete(key: K): boolean {
        this.$atom.invalidate();
        let cont = this.$content.get(key);
        if (cont !== undefined) {
            cont.invalidate();
            this.$content.delete(key);
            return true;
        }
        return false;
    }

    keys(): IterableIterator<K> {
        return this.$content.keys();
    }

    forEach(callbackfn: (value: V, index: K, map: IObservableMap<K, V>) => void, thisArg?: any): void {
        this.$atom.markUsage();
        this.$content.forEach(function (this: ObservableMap<K, V>, value: ObservableValue<V>, key: K) {
            callbackfn.call(thisArg, value.get(), key, this);
        }, this);
    }

    toJSON() {
        var res = Object.create(null);
        this.$content.forEach(function (this: any, v: ObservableValue<V>, k: K) {
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
    if (b.isArray(newValue)) return makeObservableArray<any>(newValue as any, deepEnhancer) as any as T;
    if (isES6Map(newValue)) return new ObservableMap(newValue, deepEnhancer) as any;
    if (isPlainObject(newValue)) return createObservableObject(newValue, deepEnhancer) as any as T;
    return newValue;
}

function shallowEnhancer<T>(newValue: T, oldValue: T | undefined): T {
    if (newValue === oldValue) return oldValue;
    if (newValue == null) return newValue;
    if (isObservable(newValue)) return newValue;
    if (b.isArray(newValue)) return makeObservableArray<any>(newValue as any, referenceEnhancer) as any as T;
    if (isES6Map(newValue)) return new ObservableMap(newValue, referenceEnhancer) as any;
    if (isPlainObject(newValue)) return createObservableObject(newValue, referenceEnhancer) as any as T;
    throw new Error("shallow observable cannot be used for primitive values");
}

function deepStructEnhancer<T>(newValue: T, oldValue: T | undefined): T {
    if (deepEqual(newValue, oldValue)) return oldValue!;
    if (newValue == null) return newValue;
    if (isObservable(newValue)) return newValue;
    if (b.isArray(newValue)) return makeObservableArray<any>(newValue as any, deepStructEnhancer) as any as T;
    if (isES6Map(newValue)) return new ObservableMap(newValue, deepStructEnhancer) as any;
    if (isPlainObject(newValue)) return createObservableObject(newValue, deepStructEnhancer) as any as T;
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
            value: allocId(),
        });
    }
    if (!("$bobx" in target)) {
        Object.defineProperty(target, "$bobx", {
            enumerable: false,
            writable: true,
            configurable: true,
            value: LazyClass,
        });
        if (!("toJSON" in target)) {
            target.toJSON = function (this: IAtom) {
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
            get: function (this: IAtom) {
                let val = this.$bobx[propName];
                if (val === undefined) {
                    let behind = behindObservableClass(this);
                    val = new ObservableValue(undefined, enhancer);
                    behind[propName] = val;
                }
                return val.get();
            },
            set: function (this: IAtom, value: any) {
                let val = this.$bobx[propName];
                if (val === undefined) {
                    let behind = behindObservableClass(this);
                    val = new ObservableValue(value, enhancer);
                    behind[propName] = val;
                } else {
                    val.set(value);
                }
            },
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

b.addRoot((root) => {
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
            list[i]!.updateIfNeededWithoutResurrecting();
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
    NeedDepsRecheck,
    Scope,
    PermanentlyDead,
    Waiting,
    Zombie,
}

export class CaughtException {
    constructor(public cause: any) {}
}

function buryWholeDeadSet() {
    if (buryDeadSet.size > 0) {
        buryDeadSet.forEach((v) => {
            v.buryIfDead();
        });
        buryDeadSet.clear();
    }
}

export function isCaughtException(e: any): e is CaughtException {
    return e instanceof CaughtException;
}

export class ComputedImpl implements IBobxComputed, b.IDisposable {
    fn: Function;
    that: any;
    atomId: AtomId;
    $bobx!: 1;
    value: any;
    state: ComputedState;
    zombieTime?: number;
    zombieCounter: number;
    partialResults: boolean;
    onInvalidated?: (that: IBobxComputed) => void;

    comparator: IEqualsComparer<any>;

    usedBy: Map<AtomId, IBobxComputed | IBobXBobrilCtx> | undefined;

    using: Map<AtomId, IAtom> | undefined;
    static BuryZombie: ComputedState;

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

    waitingInvalidate(_soft: boolean): ComputedState {
        throw new Error("Invalid operation");
    }

    invalidateBy(atomId: AtomId): void {
        let using = this.using;
        if (using === undefined) return;
        if (using.delete(atomId)) {
            let state = this.state;
            if (state === ComputedState.Waiting) {
                state = this.waitingInvalidate(false);
            }
            if (state === ComputedState.Updating) {
                throw new Error("Modifying inputs during updating computed");
            }
            if (state === ComputedState.Updated || state === ComputedState.NeedDepsRecheck) {
                if (DEBUG) {
                    var i = this.onInvalidated;
                    if (i) i(this);
                }
                this.state = ComputedState.NeedRecheck;
                let usedBy = this.usedBy;
                if (usedBy !== undefined) {
                    let usedByBobrilNode = false;
                    usedBy.forEach((use) => {
                        if (isIBobxComputed(use)) use.softInvalidate();
                        else usedByBobrilNode = true;
                    });
                    if (usedByBobrilNode) {
                        this.scheduleUpdateNextFrame();
                    }
                }
            }
            this.freeUsings();
        }
    }

    softInvalidate(): void {
        let state = this.state;
        if (state === ComputedState.Waiting) {
            state = this.waitingInvalidate(true);
        }
        if (state === ComputedState.Updating) {
            throw new Error("Modifying inputs during updating computed");
        }
        if (state === ComputedState.Updated) {
            this.state = ComputedState.NeedDepsRecheck;
            let usedBy = this.usedBy;
            if (usedBy !== undefined) {
                let usedByBobrilNode = false;
                usedBy.forEach((use) => {
                    if (isIBobxComputed(use)) use.softInvalidate();
                    else usedByBobrilNode = true;
                });
                if (usedByBobrilNode) {
                    this.scheduleUpdateNextFrame();
                }
            }
        }
    }

    private scheduleUpdateNextFrame(): void {
        if (updateNextFrameList.length == 0) b.invalidate(bobxRootCtx);
        updateNextFrameList.push(this);
    }

    freeUsings() {
        let using = this.using;
        if (using !== undefined) {
            this.using = undefined;
            using.forEach((v) => {
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
            using.forEach((v) => {
                if (isIBobxComputed(v)) {
                    v.unmarkUsedBy(this.atomId);
                    v.buryIfDead();
                } else {
                    (v as ObservableValue<any>).ctxs!.delete(this.atomId);
                }
            });
        }
        this.value = undefined;
    }

    buryIfDead(): void {
        if (this.usedBy !== undefined && this.usedBy.size > 0) {
            return;
        }
        buryDeadSet.delete(this);
        const state = this.state;
        if (state === ComputedState.Zombie || state === ComputedState.Waiting) return;
        if (this.zombieTime) {
            this.state = ComputedState.Zombie;
            const zombieCounter = ++this.zombieCounter;
            setTimeout(() => {
                if (this.state === ComputedState.Zombie && this.zombieCounter == zombieCounter) {
                    this.free();
                }
            }, this.zombieTime);
            return;
        }
        this.state = ComputedState.First;
        this.free();
    }

    dispose(): void {
        buryDeadSet.delete(this);
        this.state = ComputedState.PermanentlyDead;
        this.free();
    }

    constructor(fn: Function, that: any, comparator: IEqualsComparer<any>) {
        this.atomId = allocId();
        this.fn = fn;
        this.that = that;
        this.value = undefined;
        this.state = ComputedState.First;
        this.comparator = comparator;
        this.using = undefined;
        this.usedBy = undefined;
        this.partialResults = false;
        this.zombieCounter = 0;
    }

    unmarkUsedBy(atomId: AtomId): void {
        this.usedBy!.delete(atomId);
        if (this.usedBy!.size === 0) {
            buryDeadSet.add(this);
        }
    }

    markUsage(): boolean {
        const ctx = b.getCurrentCtx() as IBobxCallerCtx;
        if (ctx === undefined)
            // outside of render => nothing to mark
            return true;
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
            if (bobx.has(this.atomId)) return false;
            bobx.set(this.atomId, this);
            let ctxs = this.usedBy;
            if (ctxs === undefined) {
                ctxs = new Map();
                this.usedBy = ctxs;
            }
            ctxs.set(bobx.ctxId!, ctx);
        }
        return false;
    }

    invalidate() {
        const usedBy = this.usedBy;
        if (usedBy !== undefined) {
            usedBy.forEach(function (this: ComputedImpl, use) {
                if (isIBobxComputed(use)) use.invalidateBy(this.atomId);
                else {
                    use.$bobxCtx!.delete(this.atomId);
                    b.invalidate(use);
                }
            }, this);
            usedBy.clear();
        }
        buryDeadSet.add(this);
    }

    updateIfNeededWithoutResurrecting() {
        if (this.state === ComputedState.PermanentlyDead) return;
        this.updateIfNeeded();
    }

    updateIfNeeded(): boolean {
        const state = this.state;
        if (DEBUG && state === ComputedState.PermanentlyDead) throw new Error("Using dead computed, bug in Bobx");

        if (state === ComputedState.NeedDepsRecheck) {
            const using = this.using;
            if (using !== undefined) {
                using.forEach((v) => {
                    if (isIBobxComputed(v)) {
                        v.updateIfNeeded();
                    }
                });
            }
            if (this.state === ComputedState.NeedDepsRecheck) {
                this.state = ComputedState.Updated;
                return true;
            }
            this.update();
            return true;
        }
        if (state !== ComputedState.Updated) {
            this.update();
            return true;
        }
        return false;
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
        this.freeUsings();
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

    checkRecursion() {
        if (this.state === ComputedState.Updating) {
            throw new Error("Recursively calling computed value");
        }
    }

    run() {
        this.checkRecursion();
        const wasUpdate = this.updateIfNeeded();
        const usedOutsideOfScope = this.markUsage();
        let value = this.value;
        if (wasUpdate && usedOutsideOfScope) this.buryIfDead();
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

export function getArrayHashCode(a: any[]): number {
    var h = 0,
        l = a.length,
        i = 0;
    while (i < l) h = ((h << 5) - h + getHashCode(a[i++])) | 0;
    return h;
}

export function getHashCode(value: any): number {
    if (value == undefined) return 1;
    if (value === false) return 2;
    if (value === true) return 3;
    if (b.isNumber(value)) return value | 0;
    if (b.isString(value)) return getStringHashCode(value);
    if (b.isArray(value)) return getArrayHashCode(value);
    return getObjectHashCode(value);
}

export interface IComputedOptions<Params, Output> {
    getHashCode?(params: Params): number;
    isEqual?(a: Params, b: Params): boolean;
    onFree?(output: Output | undefined, params: Params): void;
    comparator?: IEqualsComparer<Output>;
    zombieTime?: number;
}

const defaultComputedOptions: IComputedOptions<any[], any> = {
    getHashCode: getArrayHashCode,
    isEqual(a: any[], b: any[]): boolean {
        var l = a.length;
        if (l !== b.length) return false;
        for (var i = 0; i < l; i++) {
            if (!equalsIncludingNaN(a[i], b[i])) return false;
        }
        return true;
    },
    comparator: equalsIncludingNaN,
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

export interface IAsyncComputed<T> {
    busy: boolean;
    result: T;
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
                get: function (this: IAtom) {
                    let val: ComputedImpl | undefined = this.$bobx[propName];
                    if (val === undefined) {
                        let behind = behindObservableClass(this);
                        val = new ComputedImpl(fn, this, comparator);
                        (behind as any)[propName] = val;
                    }
                    return val.run();
                },
                set: descriptor.set,
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
                value: function (this: IAtom) {
                    let val: ComputedImpl | undefined = this.$bobx[propName];
                    if (val === undefined) {
                        let behind = behindObservableClass(this);
                        val = new ComputedImpl(fn, this, comparator);
                        (behind as any)[propName] = val;
                    }
                    return val.run();
                },
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
        value: function (this: IAtom) {
            let val: ParametricComputedMap | undefined = this.$bobx[propName];
            if (val === undefined) {
                let behind = behindObservableClass(this);
                val = new ParametricComputedMap(fn, this, options);
                (behind as any)[propName] = val;
            }
            return val.run(arraySlice.call(arguments));
        },
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
        this.state = ComputedState.PermanentlyDead;
        this.owner.free(this);
    }
}

export class ParametricComputedMap implements b.IDisposable {
    fn: Function;
    that: any;
    map: Map<number, ParamComputedImpl[]>;
    getHashCode: (params: any[]) => number;
    isEqual: (a: any[], b: any[]) => boolean;
    onFree?: (output: any | undefined, params: any[]) => void;
    comparator: IEqualsComparer<any>;
    disposing: boolean;

    constructor(fn: Function, that: any, options: IComputedOptions<any[], any>) {
        this.fn = fn;
        this.that = that;
        this.map = new Map();
        this.getHashCode = options.getHashCode || defaultComputedOptions.getHashCode!;
        this.isEqual = options.isEqual || defaultComputedOptions.isEqual!;
        this.onFree = options.onFree;
        this.comparator = options.comparator || defaultComputedOptions.comparator!;
        this.disposing = false;
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
                if (this.isEqual(params, row[i]!.params)) {
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
        if (this.onFree !== undefined) {
            let target = item.value;
            if (isCaughtException(target)) target = undefined;
            this.onFree(target, item.params);
        }
        if (this.disposing) return;
        const hashCode = item.hashCode;
        const row = this.map.get(hashCode)!;
        if (row.length == 1) {
            this.map.delete(hashCode);
        } else {
            const index = row!.indexOf(item);
            row.splice(index, 1);
        }
    }

    dispose() {
        this.disposing = true;
        this.map.forEach((row) => {
            for (let i = 0, l = row.length; i < l; i++) {
                row[i]!.dispose();
            }
        });
    }
}

export function observableProp<T>(obj: Array<T>, key: number): b.IProp<T>;
export function observableProp<T, K extends keyof T>(obj: T, key: K): b.IProp<T[K]>;
export function observableProp<T, K extends keyof T>(obj: T, key: K): b.IProp<T[K]> {
    if (obj == null) throw new Error("observableProp parameter is " + obj);
    let bobx = (obj as any as IAtom).$bobx;
    if (bobx === undefined) throw new Error("observableProp parameter is not observable: " + obj);
    if (bobx === ObservableMapMarker) throw new Error("observableProp parameter is observableMap");
    if (b.isArray(bobx)) {
        // Does this pays off to cache and/or inline?
        return (...value: [any?]) => {
            if (value.length == 1) {
                obj[key] = value[0];
            }
            return obj[key];
        };
    }
    bobx = behindObservableClass(obj);
    let val = bobx[key];
    if (val === undefined) {
        (obj as any)[key] = undefined; // Has side effect to create ObservableValue
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
    let buryDeadSetBackup = buryDeadSet;
    if (callBuryIfDead) {
        buryDeadSet = new Set();
    }
    if (continueCallback != undefined) {
        haveTimeBudget = continueCallback;
        firstInterruptibleCtx = undefined;
        alreadyInterrupted = false;
    }
    computed.update();
    if (callBuryIfDead) {
        computed.buryIfDead();
        buryWholeDeadSet();
        buryDeadSet = buryDeadSetBackup;
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
        let target = this.value;
        super.free();
        this.state = ComputedState.PermanentlyDead;
        this.transformerMap.delete(this.that);
        if (this.onFree) {
            if (isCaughtException(target)) target = undefined;
            this.onFree(target, this.that);
        }
    }
}

export function createTransformer<A, B>(
    factory: (source: A) => B,
    onFree?: (target: B | undefined, source: A) => void
): (source: A) => B {
    const factoryOnThis = function (this: A): B {
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

export function useObservable<T>(initValue: T | (() => T)): b.IProp<T> {
    const myHookId = b._allocHook();
    const hooks = b._getHooks();
    let hook = hooks[myHookId];
    if (hook === undefined) {
        if (b.isFunction(initValue)) {
            initValue = initValue();
        }
        hook = new ObservableValue(initValue, deepEnhancer).prop();
        hooks[myHookId] = hook;
    }
    return hook;
}

export function useComputed<Params extends any[], Output>(
    fn: (...args: Params) => Output,
    options?: IComputedOptions<Params[], Output>
): (...args: Params) => Output {
    const myHookId = b._allocHook();
    const hooks = b._getHooks();
    let hook = hooks[myHookId];
    if (hook === undefined) {
        if (options === undefined) options = defaultComputedOptions;
        const comp = new ParametricComputedMap(fn, undefined, options);
        hook = (...args: Params) => comp.run(args);
        b.addDisposable(b.getCurrentCtx()!, comp);
        hooks[myHookId] = hook;
    }
    return hook;
}

export class ReactionImpl implements IBobxComputed, b.IDisposable {
    expression: (disposable: b.IDisposable) => any;
    reaction?: (value: any, disposable: b.IDisposable) => void;
    atomId: AtomId;
    $bobx!: 1;
    value: any;
    state: ComputedState;
    partialResults: boolean;
    onInvalidated?: (that: IBobxComputed) => void;
    comparator: IEqualsComparer<any>;
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
            if (state === ComputedState.Updated || state === ComputedState.NeedDepsRecheck) {
                if (DEBUG) {
                    var i = this.onInvalidated;
                    if (i) i(this);
                }
                this.state = ComputedState.NeedRecheck;
                this.schedule();
            }
            this.freeUsings();
        }
    }

    softInvalidate(): void {
        let state = this.state;
        if (state === ComputedState.Updated) {
            this.state = ComputedState.NeedDepsRecheck;
            this.schedule();
        }
    }

    schedule(): void {
        if (updateNextFrameList.length == 0) b.invalidate(bobxRootCtx);
        updateNextFrameList.push(this);
    }

    freeUsings() {
        let using = this.using;
        if (using !== undefined) {
            this.using = undefined;
            using.forEach((v) => {
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
            using.forEach((v) => {
                if (isIBobxComputed(v)) {
                    v.unmarkUsedBy(this.atomId);
                    v.buryIfDead();
                } else {
                    (v as ObservableValue<any>).ctxs!.delete(this.atomId);
                }
            });
        }
        this.value = undefined;
    }

    buryIfDead(): void {
        throw new Error("Reaction-buryIfDead");
    }

    dispose(): void {
        this.state = ComputedState.PermanentlyDead;
        this.free();
    }

    constructor(
        expression: (disposable: b.IDisposable) => any,
        reaction: ((value: any, disposable: b.IDisposable) => void) | undefined,
        comparator: IEqualsComparer<any>
    ) {
        this.atomId = allocId();
        this.expression = expression;
        this.reaction = reaction;
        this.value = undefined;
        this.state = ComputedState.First;
        this.comparator = comparator;
        this.using = undefined;
        this.partialResults = false;
    }

    unmarkUsedBy(_atomId: AtomId): void {
        throw new Error("Reaction-unmarkUsedBy");
    }

    markUsage(): boolean {
        throw new Error("Reaction-markUsage");
    }

    invalidate() {
        throw new Error("Reaction-invalidate");
    }

    updateIfNeededWithoutResurrecting() {
        if (this.state === ComputedState.PermanentlyDead) return;
        this.updateIfNeeded();
    }

    updateIfNeeded(): boolean {
        const state = this.state;
        if (DEBUG && state === ComputedState.PermanentlyDead) throw new Error("Using dead reaction");

        if (state === ComputedState.NeedDepsRecheck) {
            const using = this.using;
            if (using !== undefined) {
                using.forEach((v) => {
                    if (isIBobxComputed(v)) {
                        v.updateIfNeeded();
                    }
                });
            }
            if (this.state === ComputedState.NeedDepsRecheck) {
                this.state = ComputedState.Updated;
                return true;
            }
            this.update();
            return true;
        }
        if (state !== ComputedState.Updated) {
            this.update();
            return true;
        }
        return false;
    }

    call(): any {
        try {
            return this.expression(this);
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
        this.freeUsings();
        let wasChange = false;
        if (this.state === ComputedState.First) {
            this.state = ComputedState.Updated;
            this.value = this.call();
            wasChange = true;
        } else {
            this.state = ComputedState.Updated;
            let newResult = this.call();
            if (!this.comparator(this.value, newResult)) {
                this.value = newResult;
                wasChange = true;
            }
        }

        this.partialResults = alreadyInterrupted;
        b.setCurrentCtx(backupCurrentCtx);
        if (this.partialResults) {
            this.state = ComputedState.NeedRecheck;
            setPartialResults();
        }
        if (wasChange) this.runReaction();
    }

    runReaction() {
        let value = this.value;
        if (isCaughtException(value)) throw value.cause;
        const reaction = this.reaction;
        if (reaction !== undefined) {
            reaction(value, this);
        }
    }
}

addHiddenFinalProp(ReactionImpl.prototype, "$bobx", ComputedMarker);

export function reaction<T>(
    expression: (disposable: b.IDisposable) => T,
    effect: (value: T, disposable: b.IDisposable) => void
): b.IDisposable {
    const reaction = new ReactionImpl(expression, effect, equalsIncludingNaN);
    reaction.schedule();
    return reaction;
}

export function autorun(view: (disposable: b.IDisposable) => void): b.IDisposable {
    const autorun = new ReactionImpl(view, undefined, equalsIncludingNaN);
    autorun.schedule();
    return autorun;
}

export function when(predicate: () => boolean, effect: () => void): b.IDisposable {
    return autorun((d) => {
        if (predicate()) {
            d.dispose();
            effect();
        }
    });
}

export function isPromise(p: any): p is Promise<any> {
    return p instanceof Promise;
}

export function isPromiseLike(p: any): p is PromiseLike<any> {
    if (isPromise(p)) return true;
    const { then } = p || false;

    return b.isFunction(then);
}

class AsyncComputedImpl extends ComputedImpl implements IAsyncComputed<any> {
    constructor(fn: Function, comparator: IEqualsComparer<any>, zombieTime: number | undefined) {
        super(fn, undefined, comparator);
        this.iterator = undefined;
        this.zombieTime = zombieTime;
    }

    iterator: Iterator<any> | undefined;

    get busy(): boolean {
        this.checkRecursion();
        this.markUsage();
        const state = this.state;
        return state === ComputedState.Updating || state === ComputedState.Waiting;
    }

    get result(): any {
        this.checkRecursion();
        this.markUsage();
        let value = this.value;
        if (isCaughtException(value)) throw value.cause;
        return this.value;
    }

    call(): Iterator<any> {
        // this will just create iterator, it cannot throw
        return this.fn();
    }

    free() {
        super.free();
    }

    promiseFulfilled(value: any) {
        let backupCurrentCtx = b.getCurrentCtx();
        b.setCurrentCtx(this as any);
        this.state = ComputedState.Updating;
        try {
            this.iteratorNext(this.iterator!.next(value));
        } catch (err) {
            this.value = new CaughtException(err);
            this.state = ComputedState.Updated;
            this.invalidate();
        }
        b.setCurrentCtx(backupCurrentCtx);
    }

    promiseFailed(err: any) {
        let backupCurrentCtx = b.getCurrentCtx();
        b.setCurrentCtx(this as any);
        this.state = ComputedState.Updating;
        try {
            this.iteratorNext(this.iterator!.throw!(err));
        } catch (err) {
            this.value = new CaughtException(err);
            this.state = ComputedState.Updated;
            this.invalidate();
        }
        b.setCurrentCtx(backupCurrentCtx);
    }

    iteratorNext(newResult: IteratorResult<any>) {
        while (true) {
            const newValue = newResult.value;
            if (newResult.done !== true) {
                if (isPromiseLike(newValue)) {
                    this.state = ComputedState.Waiting;
                    newValue.then(
                        (v: any) => this.promiseFulfilled(v),
                        (err: any) => this.promiseFailed(err)
                    );
                    return;
                }
            }
            if (!this.comparator(this.value, newValue)) {
                this.value = newValue;
                this.invalidate();
                if (newResult.done === true) {
                    this.state = ComputedState.Updated;
                    return;
                }
            }
            if (alreadyInterrupted) {
                this.partialResults = true;
            }
            if (newResult.done === true) {
                this.state = ComputedState.Updated;
                this.invalidate();
                return;
            }
            newResult = this.iterator!.next();
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
        this.freeUsings();
        this.state = ComputedState.Updating;
        this.iterator = this.call();
        try {
            this.iteratorNext(this.iterator!.next());
        } catch (err) {
            this.value = new CaughtException(err);
            this.state = ComputedState.Updated;
            this.invalidate();
        }
        b.setCurrentCtx(backupCurrentCtx);
    }

    run() {
        if (this.state === ComputedState.Zombie) {
            this.state = ComputedState.Updated;
        }
        if (this.state !== ComputedState.Waiting) {
            this.checkRecursion();
            this.updateIfNeeded();
        }
        this.markUsage();
        return this;
    }
}

class ParamAsyncComputedImpl extends AsyncComputedImpl {
    owner: ParametricAsyncComputedMap;
    hashCode: number;
    params: any[];

    constructor(fn: Function, owner: ParametricAsyncComputedMap, hashCode: number, params: any[]) {
        super(fn, owner.comparator, owner.zombieTime);
        this.owner = owner;
        this.hashCode = hashCode;
        this.params = params;
    }

    call(): Iterator<any> {
        return this.fn.apply(undefined, this.params);
    }

    free() {
        super.free();
        this.state = ComputedState.PermanentlyDead;
        this.owner.free(this);
    }
}

// we skip promises that are the result of yielding promises (except if they use flowReturn)
export type AsyncReturnType<G> = G extends Generator<infer Y, infer R, any>
    ? Y extends PromiseLike<any>
        ? R
        : R | IfAllArePromiseYieldThenVoid<Y>
    : void;

// we extract yielded promises from the return type
export type IfAllArePromiseYieldThenVoid<R> = Exclude<R, PromiseLike<any>> extends never
    ? void
    : Exclude<R, PromiseLike<any>>;

class ParametricAsyncComputedMap implements b.IDisposable {
    fn: Function;
    map: Map<number, ParamAsyncComputedImpl[]>;
    getHashCode: (params: any[]) => number;
    isEqual: (a: any[], b: any[]) => boolean;
    onFree?: (output: any | undefined, params: any[]) => void;
    zombieTime: number | undefined;
    comparator: IEqualsComparer<any>;
    disposing: boolean;

    constructor(fn: Function, options: IComputedOptions<any[], any>) {
        this.fn = fn;
        this.map = new Map();
        this.getHashCode = options.getHashCode || defaultComputedOptions.getHashCode!;
        this.isEqual = options.isEqual || defaultComputedOptions.isEqual!;
        this.onFree = options.onFree;
        this.comparator = options.comparator || defaultComputedOptions.comparator!;
        this.zombieTime = options.zombieTime;
        this.disposing = false;
    }

    run(params: any[]) {
        const hashCode = this.getHashCode(params);
        let row = this.map.get(hashCode);
        let item: ParamAsyncComputedImpl | undefined = undefined;
        if (row === undefined) {
            item = new ParamAsyncComputedImpl(this.fn, this, hashCode, params);
            row = [item];
            this.map.set(hashCode, row);
        } else {
            const len = row.length;
            for (var i = 0; i < len; i++) {
                if (this.isEqual(params, row[i]!.params)) {
                    item = row[i];
                    break;
                }
            }
            if (item === undefined) {
                item = new ParamAsyncComputedImpl(this.fn, this, hashCode, params);
                row.push(item);
            }
        }
        return item.run();
    }

    free(item: ParamAsyncComputedImpl) {
        if (this.onFree !== undefined) {
            let target = item.value;
            if (isCaughtException(target)) target = undefined;
            this.onFree(target, item.params);
        }
        if (this.disposing) return;
        const hashCode = item.hashCode;
        const row = this.map.get(hashCode)!;
        if (row.length == 1) {
            this.map.delete(hashCode);
        } else {
            const index = row!.indexOf(item);
            row.splice(index, 1);
        }
    }

    dispose() {
        this.disposing = true;
        this.map.forEach((row) => {
            for (let i = 0, l = row.length; i < l; i++) {
                row[i]!.dispose();
            }
        });
    }
}

export function asyncComputed<T extends (...args: any[]) => Generator<any, any, any>>(
    generator: T,
    options?: IComputedOptions<Parameters<T>, IAsyncComputed<AsyncReturnType<ReturnType<T>> | undefined>>
): (...args: Parameters<T>) => IAsyncComputed<AsyncReturnType<ReturnType<T>> | undefined> {
    if (generator.length != 0 || options != undefined) {
        options ??= defaultComputedOptions;
        var map = new ParametricAsyncComputedMap(generator, options);
        return (...args: Parameters<T>) => map.run(args);
    }
    let res = new AsyncComputedImpl(generator, equalsIncludingNaN, 100);
    return () => res.run();
}

export function useAsyncComputed<T extends (...args: any[]) => Generator<any, any, any>>(
    generator: T,
    options?: IComputedOptions<Parameters<T>, IAsyncComputed<AsyncReturnType<ReturnType<T>> | undefined>>
): (...args: Parameters<T>) => IAsyncComputed<AsyncReturnType<ReturnType<T>> | undefined> {
    const myHookId = b._allocHook();
    const hooks = b._getHooks();
    let hook = hooks[myHookId];
    if (hook === undefined) {
        const map = new ParametricAsyncComputedMap(generator, options ?? defaultComputedOptions);
        hook = (...args: Parameters<T>) => map.run(args);
        b.addDisposable(b.getCurrentCtx()!, map);
        hooks[myHookId] = hook;
    }
    return hook;
}
