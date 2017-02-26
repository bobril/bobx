import * as b from 'bobril';

export function addHiddenProp(object: any, propName: string, value: any) {
    Object.defineProperty(object, propName, {
        enumerable: false,
        writable: true,
        configurable: true,
        value
    });
}

export function addHiddenFinalProp(object: any, propName: string, value: any) {
    Object.defineProperty(object, propName, {
        enumerable: false,
        writable: false,
        configurable: true,
        value
    });
}

export function makeNonEnumerable(object: any, propNames: string[]) {
    for (let i = 0; i < propNames.length; i++) {
        addHiddenProp(object, propNames[i], object[propNames[i]]);
    }
}

interface IBobXInCtx {
    ctxId: string;
    [atomId: string]: IAtom | string;
}

interface IBobXBobrilCtx extends b.IBobrilCtx {
    $bobx: IBobXInCtx | undefined;
}

interface IAtom {
    $bobx: any;
}

type IEnhancer<T> = (newValue: T, curValue: T | undefined) => T;

export interface IObservableValue<T> {
    get(): T;
    set(value: T): void;
}


let lastId = 0;

function allocId() {
    return "" + ++lastId;
}

export class ObservableValue<T> implements IObservableValue<T>, IAtom {

    constructor(value: T, enhancer: IEnhancer<T>) {
        this.atomId = allocId();
        this.ctxs = undefined;
        this.value = enhancer(value, undefined);
        this.enhancer = enhancer;
        this.$bobx = null;
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
        if (newValue !== this.value) {
            this.invalidate();
            this.value = newValue;
        }
    }

    atomId: string;

    ctxs: { [ctxId: string]: IBobXBobrilCtx } | undefined;

    markUsage() {
        const ctx = b.getCurrentCtx() as IBobXBobrilCtx;
        if (ctx === undefined) // outside of render => nothing to mark
            return;
        let bobx = ctx.$bobx;
        if (bobx === undefined) {
            bobx = Object.create(null) as IBobXInCtx;
            bobx.ctxId = allocId();
            ctx.$bobx = bobx;
        }
        if (bobx[this.atomId] !== undefined)
            return;
        bobx[this.atomId] = this;
        if (this.ctxs === undefined) {
            this.ctxs = Object.create(null);
        }
        this.ctxs![bobx.ctxId] = ctx;
    }

    invalidate() {
        const ctxs = this.ctxs;
        if (ctxs === undefined)
            return;
        this.ctxs = undefined;
        for (let ctxId in ctxs) {
            const ctx = ctxs[ctxId];
            delete ctx.$bobx![this.atomId];
            b.invalidate(ctx);
        }
    }

    toJSON() {
        return this.get();
    }
}

let previousBeforeRender = b.setBeforeRender((node: b.IBobrilNode, phase: b.RenderPhase) => {
    if (phase === b.RenderPhase.Destroy || phase === b.RenderPhase.Update || phase === b.RenderPhase.LocalUpdate) {
        const ctx = b.getCurrentCtx() as IBobXBobrilCtx;
        let bobx = ctx.$bobx;
        if (bobx === undefined)
            return;
        const ctxId = bobx.ctxId;
        ctx.$bobx = (phase === b.RenderPhase.Destroy) ? undefined : { ctxId };
        for (let atomId in bobx) {
            if (atomId === "ctxId")
                continue;
            delete (bobx[atomId] as ObservableValue<any>).ctxs![ctxId];
        }
    }
    previousBeforeRender(node, phase);
});

export function referenceEnhancer<T>(newValue: T, _oldValue: T | undefined): T {
    return newValue;
}

export function isObservable(value: any) {
    return value != null && value.$bobx !== undefined;
}

export function isObject(value: any): boolean {
    return value !== null && typeof value === "object";
}

export function isPlainObject(value: any) {
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
    behind = Object.create(null);
    (target as any).$bobx = behind;
    return behind;
}

export function deepEqual(a: any, b: any) {
    if (a === b)
        return true;
    if (typeof a !== "object" || typeof b !== "object")
        return false;
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
    if (typeof a === "object" && typeof b === "object") {
        if (a === null || b === null)
            return false;
        let bKeys = 0;
        for (let _prop in b) {
            bKeys++;
        }
        let aKeys = 0;
        for (let prop in a) {
            aKeys++;
            if (!(prop in b))
                return false;
            if (!deepEqual(a[prop], b[prop]))
                return false;
        }
        return aKeys == bKeys;
    }
    return false;
}

const observablePropertyConfigs: { [propName: string]: any } = Object.create(null);

export function generateObservablePropConfig(propName: string) {
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

export function defineObservableProperty(
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

    $bobx: Array<T>;
}


/**
 * This array buffer contains two lists of properties, so that all arrays
 * can recycle their property definitions, which significantly improves performance of creating
 * properties on the fly.
 */
let observableArrayPropCount = 0;

// Typescript workaround to make sure ObservableArray extends Array
export class StubArray {
}
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
        return Array.prototype.concat.apply(this.$bobx, arrays.map(a => isObservableArray(a) ? a.$bobx : a));
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
    addHiddenProp(ObservableArray.prototype, funcName, function (this: IAtom) {
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
    return isObject(thing) && Array.isArray(thing.$bobx);
}

function isArrayLike(thing: any) {
    return b.isArray(thing) || isObservableArray(thing);
}

export function deepEnhancer<T>(newValue: T, oldValue: T | undefined): T {
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
        for (let key in newValue) {
            defineObservableProperty(res, behind, key, newValue[key], deepEnhancer);
        }
        return res;
    }
    return newValue;
}

export function shallowEnhancer<T>(newValue: T, oldValue: T | undefined): T {
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
        for (let key in newValue) {
            defineObservableProperty(res, behind, key, newValue[key], referenceEnhancer);
        }
        return res;
    }
    throw new Error("shallow observable cannot be used for primitive values");
}

export function deepStructEnhancer<T>(newValue: T, oldValue: T | undefined): T {
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
        for (let key in newValue) {
            defineObservableProperty(res, behind, key, newValue[key], deepStructEnhancer);
        }
        return res;
    }

    return newValue;
}
export function refStructEnhancer<T>(newValue: T, oldValue: T | undefined): T {
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

export function createDecoratorForEnhancer(enhancer: IEnhancer<any>) {
    return function classPropertyDecorator(target: any, propName: string, _descriptor: PropertyDescriptor) {
        // target is actually prototype not instance
        if (!("$bobx" in target)) {
            Object.defineProperty(target, "$bobx", {
                enumerable: false,
                writable: true,
                configurable: true,
                value: LazyClass
            });
        }
        return {
            configurable: true,
            enumerable: false,
            get: function (this: IAtom) {
                let behind = asObservableClass(this);
                let val = behind[propName];
                if (val === undefined) {
                    val = new ObservableValue(undefined, enhancer);
                    behind[propName] = val;
                }
                return val.get();
            },
            set: function (this: IAtom, value: any) {
                let behind = asObservableClass(this);
                let val = behind[propName];
                if (val === undefined) {
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
    //<T>(value: T[]): IObservableArray<T>;
    (value: string): IObservableValue<string>;
    (value: boolean): IObservableValue<boolean>;
    (value: number): IObservableValue<number>;
    (value: Date): IObservableValue<Date>;
    (value: RegExp): IObservableValue<RegExp>;
    (value: Function): IObservableValue<Function>;
    <T>(value: null | undefined): IObservableValue<T>;
    (value: null | undefined): IObservableValue<any>;
    (): IObservableValue<any>;
    //<T>(value: IMap<string | number | boolean, T>): ObservableMap<T>;
    <T extends Object>(value: T): T;
    <T>(value: T): IObservableValue<T>;
}

export interface IObservableFactories {
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

observable.deep = deepDecorator as any;
observable.ref = refDecorator as any;
observable.shallow = shallowDecorator;
observable.struct = deepStructDecorator;
observable.deep.struct = deepStructDecorator;
observable.ref.struct = refStructDecorator;
