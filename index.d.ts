import * as b from 'bobril';
export declare type AtomId = number;
export declare type CtxId = number;
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
    $bobx: null;
    markUsing(atomId: AtomId, atom: IAtom): boolean;
    invalidateBy(atomId: AtomId): void;
    update(): void;
    updateIfNeeded(): void;
}
export declare type IBobxCallerCtx = IBobxComputed | IBobXBobrilCtx;
export declare type IEnhancer<T> = (newValue: T, curValue: T | undefined) => T;
export interface IObservableValue<T> {
    get(): T;
    set(value: T): void;
    prop(): b.IProp<T>;
}
export declare class ObservableValue<T> implements IObservableValue<T>, IAtom {
    constructor(value: T, enhancer: IEnhancer<T>);
    $bobx: null;
    enhancer: IEnhancer<T>;
    value: T;
    get(): T;
    set(value: T): void;
    prop(): b.IProp<T>;
    _prop: b.IProp<T> | undefined;
    atomId: AtomId;
    ctxs: Map<CtxId, IBobxCallerCtx> | undefined;
    markUsage(): void;
    invalidate(): void;
    toJSON(): T;
}
export declare function isObservable(value: any): boolean;
export declare function asObservableClass(target: Object): ObservableObjectBehind;
export declare function deepEqual(a: any, b: any): boolean;
export declare type ObservableObjectBehind = {
    [prop: string]: IObservableValue<any>;
};
export interface IObservableArray<T> extends Array<T> {
    clear(): T[];
    replace(newItems: T[]): T[];
    find(predicate: (item: T, index: number, array: IObservableArray<T>) => boolean, thisArg?: any, fromIndex?: number): T;
    remove(value: T): boolean;
    move(fromIndex: number, toIndex: number): void;
}
export declare class StubArray {
}
export declare class ObservableArray<T> extends StubArray {
    $bobx: Array<T>;
    $enhancer: IEnhancer<T>;
    $atom: ObservableValue<any>;
    constructor(initialValues: T[] | undefined, enhancer: IEnhancer<T>);
    splice(index?: number, deleteCount?: number, newItems?: T[]): T[];
    setArrayLength(newLength: number): void;
    clear(): T[];
    concat(...arrays: T[][]): T[];
    replace(newItems: T[]): T[];
    /**
     * Converts this array back to a (shallow) javascript structure.
     */
    toJS(): T[];
    toJSON(): T[];
    find(predicate: (item: T, index: number, array: ObservableArray<T>) => boolean, thisArg?: any, fromIndex?: number): T | undefined;
    push(...items: T[]): number;
    pop(): T | undefined;
    shift(): T | undefined;
    unshift(...items: T[]): number;
    reverse(): T[];
    sort(_compareFn?: (a: T, b: T) => number): T[];
    remove(value: T): boolean;
    private checkIndex(index);
    move(fromIndex: number, toIndex: number): void;
    toString(): string;
}
export declare function isObservableArray(thing: any): thing is IObservableArray<any>;
export declare function isObservableMap(thing: any): thing is IObservableMap<any, any>;
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
export declare type IMapEntry<K, V> = [K, V];
export declare type IMapEntries<K, V> = IMapEntry<K, V>[];
export interface IObservableMap<K, V> extends IMap<K, V> {
    prop(key: K): b.IProp<V>;
}
export declare type IObservableMapInitialValues<K, V> = IMapEntries<K, V> | IKeyValueMap<V> | IMap<K, V> | Map<K, V>;
export declare function initObservableClassPrototype(target: any): void;
export interface IObservableFactory {
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
export declare var observable: IObservableFactory & IObservableFactories & {
    deep: {
        struct(target: Object, property: string, descriptor?: PropertyDescriptor): any;
    };
    ref: {
        struct(target: Object, property: string, descriptor?: PropertyDescriptor): any;
    };
};
export declare let maxIterations: number;
export declare type IEqualsComparer<T> = (o: T, n: T) => boolean;
export interface IComputedFactory {
    (target: any, propName: string, descriptor: PropertyDescriptor): TypedPropertyDescriptor<any>;
    struct: (target: any, propName: string, descriptor: PropertyDescriptor) => TypedPropertyDescriptor<any>;
    equals<T>(comparator: IEqualsComparer<T>): (target: any, propName: string, descriptor: TypedPropertyDescriptor<any>) => TypedPropertyDescriptor<any>;
}
export declare var computed: IComputedFactory;
export declare function observableProp<T>(obj: Array<T>, key: number): b.IProp<T>;
export declare function observableProp<T, K extends keyof T>(obj: T, key: K): b.IProp<T[K]>;
