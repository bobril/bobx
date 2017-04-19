import * as b from 'bobril';

function equalsIncludingNaN(a: any, b: any) {
    return (a === b) || (a !== a && b !== b); // it correctly returns true for NaN and NaN
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

interface IBobXInCtx {
    ctxId: string;
    [atomId: string]: IAtom | string;
}

interface IBobXBobrilCtx extends b.IBobrilCtx {
    $bobxCtx?: IBobXInCtx | undefined;
}

interface IObservable {
    $bobx: any;
}
interface IAtom extends IObservable {
    atomId: string;
}

interface IBobxComputed extends IAtom {
    $bobx: null;
    markUsing(atomId: string, atom: IAtom): boolean;
    invalidateBy(atomId: string): void;
    update(): void;
}

type IBobxCallerCtx = IBobxComputed | IBobXBobrilCtx;

type IEnhancer<T> = (newValue: T, curValue: T | undefined) => T;

export interface IObservableValue<T> {
    get(): T;
    set(value: T): void;
    prop(): b.IProp<T>;
}


let lastId = 0;

function allocId() {
    return "" + ++lastId;
}

function isIBobxComputed(v: IBobxCallerCtx): v is IBobxComputed {
    return (v as IBobxComputed).$bobx === null;
}

class ObservableValue<T> implements IObservableValue<T>, IAtom {

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

    atomId: string;

    ctxs: { [ctxId: string]: IBobxCallerCtx } | undefined;

    markUsage() {
        const ctx = b.getCurrentCtx() as IBobxCallerCtx;
        if (ctx === undefined) // outside of render => nothing to mark
            return;
        if (isIBobxComputed(ctx)) {
            if (ctx.markUsing(this.atomId, this)) {
                let ctxs = this.ctxs;
                if (ctxs === undefined) {
                    ctxs = Object.create(null);
                    this.ctxs = ctxs;
                }
                ctxs![ctx.atomId] = ctx;
            }
        } else {
            let bobx = ctx.$bobxCtx;
            if (bobx === undefined) {
                bobx = Object.create(null) as IBobXInCtx;
                bobx.ctxId = allocId();
                ctx.$bobxCtx = bobx;
            }
            if (bobx[this.atomId] !== undefined)
                return;
            bobx[this.atomId] = this;
            if (this.ctxs === undefined) {
                this.ctxs = Object.create(null);
            }
            this.ctxs![bobx.ctxId] = ctx;
        }
    }

    invalidate() {
        const ctxs = this.ctxs;
        if (ctxs === undefined)
            return;
        this.ctxs = undefined;
        for (let ctxId in ctxs) {
            const ctx = ctxs[ctxId];
            if (isIBobxComputed(ctx)) {
                ctx.invalidateBy(this.atomId);
            } else {
                delete ctx.$bobxCtx![this.atomId];
                b.invalidate(ctx);
            }
        }
    }

    toJSON() {
        return this.get();
    }
}

let previousBeforeRender = b.setBeforeRender((node: b.IBobrilNode, phase: b.RenderPhase) => {
    const ctx = b.getCurrentCtx() as IBobXBobrilCtx;
    if (phase === b.RenderPhase.Destroy || phase === b.RenderPhase.Update || phase === b.RenderPhase.LocalUpdate) {
        let bobx = ctx.$bobxCtx;
        if (bobx !== undefined) {
            const ctxId = bobx.ctxId;
            ctx.$bobxCtx = (phase === b.RenderPhase.Destroy) ? undefined : { ctxId };
            for (let atomId in bobx) {
                if (atomId === "ctxId")
                    continue;
                delete (bobx[atomId] as ObservableValue<any>).ctxs![ctxId];
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

function isPlainObject(value: any): value is object {
    if (value === null || typeof value !== "object")
        return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function asObservableObject(target: Object): ObservableObjectBehind {
    let behind = (target as IAtom).$bobx;
    if (behind !== undefined)
        return behind;
    behind = Object.create(null);
    addHiddenFinalProp(target, "$bobx", behind);
    return behind;
}

function asObservableClass(target: Object): ObservableObjectBehind {
    let behind = (target as IAtom).$bobx;
    if (behind !== LazyClass)
        return behind;
    behind = {};
    (target as any).$bobx = behind;
    return behind;
}

export function deepEqual(a: any, b: any): boolean {
    if (a === b)
        return true;
    if (typeof a !== "object" || typeof b !== "object") {
        if (a !== a && b !== b) return true;
        return false;
    }
    if (isArrayLike(a)) {
        if (!isArrayLike(b)) return false;
        const length = a.length;
        if (length != b.length)
            return false;
        const aArray = a.$bobx || a;
        const bArray = b.$bobx || b;
        for (let i = 0; i < length; i++) {
            if (!deepEqual(aArray[i], bArray[i]))
                return false;
        }
        return true;
    }
    if (isObservableMap(a)) {
        if (isObservableMap(b)) {
            if (a.size != b.size) return false;
            let res = true;
            a.forEach((v, k) => {
                if (!res) return;
                if (!b.has(k)) { res = false; return; }
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
            if (!(k in bb)) { res = false; return; }
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
            if (!(k in aa)) { res = false; return; }
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
        if (!(prop in bb))
            return false;
        if (!deepEqual(a[prop], b[prop]))
            return false;
    }
    return aKeys == bKeys;
}

const observablePropertyConfigs: { [propName: string]: any } = Object.create(null);

function generateObservablePropConfig(propName: string) {
    const config = observablePropertyConfigs[propName];
    if (config)
        return config;
    return observablePropertyConfigs[propName] = {
        configurable: true,
        enumerable: true,
        get: function (this: IAtom) {
            return this.$bobx[propName].get();
        },
        set: function (this: IAtom, value: any) {
            this.$bobx[propName].set(value);
        }
    };
}

type ObservableObjectBehind = { [prop: string]: IObservableValue<any> };

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
    Object.defineProperty(p, "0", { set: () => { v = true; } });
    (Object.create(p) as any)["0"] = 1;
    return v === false;
})();

export interface IObservableArray<T> extends Array<T> {
    clear(): T[];
    replace(newItems: T[]): T[];
    find(predicate: (item: T, index: number, array: IObservableArray<T>) => boolean, thisArg?: any, fromIndex?: number): T;
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
class StubArray {
}
StubArray.prototype = [];

class ObservableArray<T> extends StubArray {
    $bobx: Array<T>;
    $enhancer: IEnhancer<T>;
    $atom: ObservableValue<any>;

    constructor(initialValues: T[] | undefined, enhancer: IEnhancer<T>) {
        super();

        this.$enhancer = enhancer;
        this.$atom = new ObservableValue<any>(null, referenceEnhancer);

        if (initialValues && initialValues.length) {
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

        for (let i = 0; i < newItems.length; i++) {
            newItems[i] = this.$enhancer(newItems[i], undefined);
        }
        return this.$bobx.splice(index, deleteCount, ...newItems);
    }

    setArrayLength(newLength: number) {
        let currentLength = this.$bobx.length;
        if (newLength === currentLength)
            return;
        else if (newLength > currentLength)
            this.splice(currentLength, 0, new Array(newLength - currentLength));
        else
            this.splice(newLength, currentLength - newLength);
    }

    clear(): T[] {
        return this.splice(0);
    }

    concat(...arrays: T[][]): T[] {
        this.$atom.markUsage();
        return Array.prototype.concat.apply(this.$bobx, arrays.map(a => isObservableArray(a) ? (a as any as ObservableArray<T>).$bobx : a));
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

    find(predicate: (item: T, index: number, array: ObservableArray<T>) => boolean, thisArg?: any, fromIndex = 0): T | undefined {
        this.$atom.markUsage();
        const values = this.$bobx, l = values.length;
        for (let i = fromIndex; i < l; i++)
            if (predicate.call(thisArg, values[i], i, this))
                return values[i];
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
        values.reverse.apply(values, arguments);
        return this as any;
    }

    sort(_compareFn?: (a: T, b: T) => number): T[] {
        this.$atom.invalidate();
        let values = this.$bobx;
        values.sort.apply(values, arguments);
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
            newItems = [...oldItems.slice(0, fromIndex), ...oldItems.slice(fromIndex + 1, toIndex + 1), oldItems[fromIndex], ...oldItems.slice(toIndex + 1)];
        } else {	// toIndex < fromIndex
            newItems = [...oldItems.slice(0, toIndex), oldItems[fromIndex], ...oldItems.slice(toIndex, fromIndex), ...oldItems.slice(fromIndex + 1)];
        }
        this.replace(newItems);
    }

    toString(): string {
        this.$atom.markUsage();
        return Array.prototype.toString.apply(this.$bobx, arguments);
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
    get: function (this: ObservableArray<any>): number {
        this.$atom.markUsage();
        return this.$bobx.length;
    },
    set: function (this: ObservableArray<any>, newLength: number) {
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
    addHiddenProp(ObservableArray.prototype, funcName, function (this: ObservableArray<any>) {
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
        set, get
    });
}

function createArraySetter(index: number) {
    return function <T>(this: ObservableArray<any>, newValue: T) {
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
        } else
            throw new Error(`Array index out of bounds, ${index} is larger than ${values.length}`);
    };
}

function createArrayGetter(index: number) {
    return function (this: ObservableArray<any>) {
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
    for (let index = observableArrayPropCount; index < max; index++)
        createArrayBufferItem(index);
    observableArrayPropCount = max;
}

reserveArrayBuffer(100);

export function isObservableArray(thing: any): thing is IObservableArray<any> {
    return isObject(thing) && b.isArray(thing.$bobx);
}

function isArrayLike(thing: any) {
    return b.isArray(thing) || isObservableArray(thing);
}

const ObservableMapMarker = 0;

export function isObservableMap(thing: any): thing is IObservableMap<any> {
    return isObject(thing) && thing.$bobx === ObservableMapMarker;
}

export interface IMap<K, V> {
    clear(): void;
    delete(key: K): boolean;
    forEach(callbackfn: (value: V, index: K, map: IMap<K, V>) => void, thisArg?: any): void;
    get(key: K): V | undefined;
    has(key: K): boolean;
    set(key: K, value?: V): this;
    readonly size: number;
}

export interface IKeyValueMap<V> {
    [key: string]: V;
}

export type IMapEntry<V> = [string, V];

export type IMapEntries<V> = IMapEntry<V>[];

export interface IObservableMap<TValue> extends IMap<string, TValue> {
    prop(key: string): b.IProp<TValue>;
}

export type IObservableMapInitialValues<V> = IMapEntries<V> | IKeyValueMap<V> | IMap<string, V>;

class ObservableMap<TValue> implements IObservableMap<TValue> {
    _size: number;

    get size(): number {
        this.$atom.markUsage();
        return this._size;
    }
    $bobx: 0;
    $enhancer: IEnhancer<TValue>;
    $atom: ObservableValue<any>;
    $content: IKeyValueMap<ObservableValue<TValue>>;

    constructor(init: IObservableMapInitialValues<TValue>, enhancer: IEnhancer<TValue>) {
        this.$enhancer = enhancer;
        this.$atom = new ObservableValue<any>(null, referenceEnhancer);
        this.$content = Object.create(null);
        this._size = 0;
        if (Array.isArray(init))
            init.forEach(([key, value]) => this.set(key, value));
        else if (isObservableMap(init)) {
            init.forEach((value, key) => this.set(key, value));
        } else if (isPlainObject(init))
            Object.keys(init).forEach(key => this.set(key, (init as IKeyValueMap<TValue>)[key]));
        else if (init != null)
            throw new Error("Cannot initialize map from " + init);
    }

    has(key: string): boolean {
        let cont = this.$content[key];
        if (cont !== undefined) {
            cont.markUsage();
            return true;
        }
        this.$atom.markUsage();
        return false;
    }

    get(key: string): TValue | undefined {
        let cont = this.$content[key];
        if (cont !== undefined) {
            return cont.get();
        }
        this.$atom.markUsage();
        return undefined;
    }

    set(key: string, value: TValue): this {
        let cont = this.$content[key];
        if (cont !== undefined) {
            cont.set(value);
            return this;
        }
        this.$atom.invalidate();
        this.$content[key] = new ObservableValue(value, this.$enhancer);
        this._size++;
        return this;
    }

    prop(key: string): b.IProp<TValue> {
        let cont = this.$content[key];
        if (cont !== undefined) {
            cont.markUsage();
            return cont.prop();
        }
        this.$atom.markUsage();
        return (value?: TValue) => {
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
        for (let k in c) {
            c[k].invalidate();
        }
        this.$atom.invalidate();
        this._size = 0;
        this.$content = Object.create(null);
    }

    delete(key: string): boolean {
        this.$atom.invalidate();
        let cont = this.$content[key];
        if (cont !== undefined) {
            cont.invalidate();
            delete this.$content[key];
            this._size--;
            return true;
        }
        return false;
    }

    forEach(callbackfn: (value: TValue, index: string, map: IMap<string, TValue>) => void, thisArg?: any): void {
        this.$atom.markUsage();
        let c = this.$content;
        for (let k in c) {
            callbackfn.call(thisArg, c[k].get(), k, this);
        }
    }

    toJSON() {
        return this.$content;
    }
}

addHiddenFinalProp(ObservableMap.prototype, "$bobx", ObservableMapMarker);

function deepEnhancer<T>(newValue: T, oldValue: T | undefined): T {
    if (newValue === oldValue)
        return oldValue;
    if (isObservable(newValue))
        return newValue;
    if (newValue == null)
        return newValue;
    if (b.isArray(newValue))
        return (new ObservableArray(newValue, deepEnhancer)) as any;
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
    if (newValue === oldValue)
        return oldValue;
    if (isObservable(newValue))
        return newValue;
    if (newValue == null)
        return newValue;
    if (b.isArray(newValue))
        return new ObservableArray(newValue, referenceEnhancer) as any;
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
    if (deepEqual(newValue, oldValue))
        return oldValue!;

    if (isObservable(newValue))
        return newValue;

    if (b.isArray(newValue))
        return new ObservableArray(newValue, deepStructEnhancer) as any;
    //if (isES6Map(newValue))
    //	return new ObservableMap(newValue, deepStructEnhancer, name);
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
    if (deepEqual(newValue, oldValue))
        return oldValue!;
    return newValue;
}

const deepDecorator = createDecoratorForEnhancer(deepEnhancer);
const shallowDecorator = createDecoratorForEnhancer(shallowEnhancer);
const refDecorator = createDecoratorForEnhancer(referenceEnhancer);
const deepStructDecorator = createDecoratorForEnhancer(deepStructEnhancer);
const refStructDecorator = createDecoratorForEnhancer(refStructEnhancer);

const LazyClass = {};

function initObservableClassPrototype(target: any) {
    // target is actually prototype not instance
    if (!("$bobx" in target)) {
        Object.defineProperty(target, "$bobx", {
            enumerable: false,
            writable: true,
            configurable: true,
            value: LazyClass
        });
        if (!("toJSON" in target)) {
            target.toJSON = function (this: IAtom) {
                return this.$bobx;
            }
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
                    let behind = asObservableClass(this);
                    val = new ObservableValue(undefined, enhancer);
                    behind[propName] = val;
                }
                return val.get();
            },
            set: function (this: IAtom, value: any) {
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
    }
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
    //<T>(value: IMap<string | number | boolean, T>): IObservableMap<T>;
    <T extends Object>(value: T): T;
    <T>(value: T): IObservableValue<T>;
}

export interface IObservableFactories {
    map<V>(init?: IObservableMapInitialValues<V>): IObservableMap<V>;

    shallowMap<V>(init?: IObservableMapInitialValues<V>): IObservableMap<V>;

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
    if (typeof arguments[1] === "string")
        return deepDecorator.apply(null, arguments);

    // it is an observable already, done
    if (isObservable(value))
        return value;

    // something that can be converted and mutated?
    const res = deepEnhancer(value, undefined);

    // this value could be converted to a new observable data structure, return it
    if (res !== value)
        return res;

    return new ObservableValue(value, deepEnhancer);
}

export var observable: IObservableFactory & IObservableFactories & {
    deep: {
        struct(target: Object, property: string, descriptor?: PropertyDescriptor): any
    },
    ref: {
        struct(target: Object, property: string, descriptor?: PropertyDescriptor): any
    }
} = createObservable as any;

observable.map = (init: IObservableMapInitialValues<any>) => new ObservableMap(init, deepEnhancer);
observable.shallowMap = (init: IObservableMapInitialValues<any>) => new ObservableMap(init, referenceEnhancer);
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

let updateNextFrameList: IBobxComputed[] = [];

export let maxIterations = 100;

const previousReallyBeforeFrame = b.setReallyBeforeFrame(() => {
    let iteration = 0;
    while (iteration++ < maxIterations) {
        let list = updateNextFrameList;
        if (list.length == 0) break;
        updateNextFrameList = [];
        for (let i = 0; i < list.length; i++) {
            list[i].update();
        }
    }
    if (iteration >= maxIterations) {
        throw new Error("Computed values did not stabilize after " + maxIterations + " iterations");
    }
    previousReallyBeforeFrame();
});
type IComparator<T> = (o: T, n: T) => boolean;

const enum ComputedState {
    First,
    NeedRecheck,
    Updating,
    Updated
}

class Computed implements IBobxComputed {
    fn: Function;
    that: any;
    atomId: string;
    $bobx: null;
    value: any;
    exception: any;
    state: ComputedState;

    comparator: IComparator<any>;

    usedBy: { [atomId: string]: IBobxComputed } | undefined;
    ctxs: { [ctxId: string]: IBobXBobrilCtx } | undefined;

    using: { [atomId: string]: IAtom } | undefined;

    markUsing(atomId: string, atom: IAtom): boolean {
        let using = this.using;
        if (using === undefined) {
            using = Object.create(null);
            using![atomId] = atom;
            this.using = using;
            return true;
        }
        if (using![atomId] !== undefined)
            return false;
        using[atomId] = atom;
        return true;
    }
    invalidateBy(atomId: string): void {
        let using = this.using;
        if (using === undefined)
            return;
        if (using[atomId] !== undefined) {
            delete using[atomId];
            if (this.state === ComputedState.Updating) {
                throw new Error("Modifying inputs during updating computed");
            }
            if (this.state === ComputedState.Updated) {
                this.state = ComputedState.NeedRecheck;
                const myAtomId = this.atomId;
                let usedBy = this.usedBy;
                if (usedBy !== undefined) {
                    this.usedBy = undefined;
                    for (let atomId in usedBy) {
                        const comp = usedBy[atomId];
                        comp.invalidateBy(myAtomId);
                    }
                }
                if (this.ctxs !== undefined) {
                    updateNextFrameList.push(this);
                    b.invalidate(bobxRootCtx);
                }
            }
        }
    }

    constructor(fn: Function, that: any) {
        this.atomId = allocId();
        this.$bobx = null;
        this.fn = fn;
        this.that = that;
        this.ctxs = undefined;
        this.value = undefined;
        this.state = ComputedState.First;
        this.exception = undefined;
        this.comparator = equalsIncludingNaN;
        this.using = undefined;
        this.usedBy = undefined;
    }

    markUsage() {
        const ctx = b.getCurrentCtx() as IBobxCallerCtx;
        if (ctx === undefined) // outside of render => nothing to mark
            return;
        if (isIBobxComputed(ctx)) {
            if (ctx.markUsing(this.atomId, this)) {
                let ctxs = this.usedBy;
                if (ctxs === undefined) {
                    ctxs = Object.create(null);
                    this.usedBy = ctxs;
                }
                ctxs![ctx.atomId] = ctx;
            }
        } else {
            let bobx = ctx.$bobxCtx;
            if (bobx === undefined) {
                bobx = Object.create(null) as IBobXInCtx;
                bobx.ctxId = allocId();
                ctx.$bobxCtx = bobx;
            }
            if (bobx[this.atomId] !== undefined)
                return;
            bobx[this.atomId] = this;
            if (this.ctxs === undefined) {
                this.ctxs = Object.create(null);
            }
            this.ctxs![bobx.ctxId] = ctx;
        }
    }

    invalidate() {
        const myAtomId = this.atomId;
        const ctxs = this.ctxs;
        if (ctxs === undefined)
            return;
        this.ctxs = undefined;
        for (let ctxId in ctxs) {
            const ctx = ctxs[ctxId];
            delete ctx.$bobxCtx![myAtomId];
            b.invalidate(ctx);
        }
    }

    update() {
        let backupCurrentCtx = b.getCurrentCtx();
        b.setCurrentCtx(this as any);
        let isFirst = this.state === ComputedState.First;
        this.state = ComputedState.Updating;
        try {
            let newResult = this.fn.call(this.that);
            if (isFirst || this.exception !== undefined || !this.comparator(this.value, newResult)) {
                this.exception = undefined;
                this.value = newResult;
            } else {
                isFirst = true;
            }
        }
        catch (err) {
            this.exception = err;
            this.value = undefined;
        }
        if (!isFirst)
            this.invalidate();
        this.state = ComputedState.Updated;
        b.setCurrentCtx(backupCurrentCtx);
    }
    run() {
        if (this.state === ComputedState.Updating) {
            throw new Error("Recursively calling computed value");
        }
        this.markUsage();
        if (this.state !== ComputedState.Updated) {
            this.update();
        }
        if (this.exception !== undefined)
            throw this.exception;
        return this.value;
    }
}

export function computed(target: any, propName: string, descriptor: PropertyDescriptor): TypedPropertyDescriptor<any> {
    initObservableClassPrototype(target);
    const fn = descriptor.value;
    return {
        configurable: true,
        enumerable: false,
        value: function (this: IAtom) {
            let val: Computed | undefined = this.$bobx[propName];
            if (val === undefined) {
                let behind = asObservableClass(this);
                val = new Computed(fn, this);
                (behind as any)[propName] = val;
            }
            return val.run();
        },
    };
}

export function observableProp<T>(obj: Array<T>, key: number): b.IProp<T>;
export function observableProp<T, K extends keyof T>(obj: T, key: K): b.IProp<T[K]>;
export function observableProp<T, K extends keyof T>(obj: T, key: K): b.IProp<T[K]> {
    if (obj == null)
        throw new Error("observableProp parameter is " + obj);
    let bobx = (obj as any as IAtom).$bobx;
    if (bobx === undefined)
        throw new Error("observableProp parameter is not observable: " + obj);
    if (bobx === ObservableMapMarker)
        throw new Error("observableProp parameter is observableMap");
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
