import { deepEqual, observable } from "../index";

describe("deepEqual", () => {
    it("primitives", () => {
        expect(deepEqual(1, 2)).toBe(false);
        expect(deepEqual(1, 1)).toBe(true);
        expect(deepEqual("A", "A")).toBe(true);
        expect(deepEqual("A", "B")).toBe(false);
        expect(deepEqual(null, undefined)).toBe(false);
        expect(deepEqual(null, null)).toBe(true);
        expect(deepEqual(undefined, undefined)).toBe(true);
    });

    it("arrays", () => {
        expect(deepEqual([1], [1])).toBe(true);
        expect(deepEqual([1], [1, 2])).toBe(false);
        expect(deepEqual([1], [2])).toBe(false);
        expect(deepEqual([1], observable([1]))).toBe(true);
        expect(deepEqual([1], observable([1, 2]))).toBe(false);
        expect(deepEqual([1], observable([2]))).toBe(false);
        expect(deepEqual(observable([1]), observable([1]))).toBe(true);
        expect(deepEqual(observable([1]), observable([1, 2]))).toBe(false);
        expect(deepEqual(observable([1]), observable([2]))).toBe(false);
        expect(deepEqual(observable([1]), [1])).toBe(true);
        expect(deepEqual(observable([1]), [1, 2])).toBe(false);
        expect(deepEqual(observable([1]), [2])).toBe(false);
    });

    it("objects", () => {
        expect(deepEqual({}, {})).toBe(true);
        expect(deepEqual({}, observable({}))).toBe(true);
        expect(deepEqual(observable({}), observable({}))).toBe(true);
        expect(deepEqual(observable({}), {})).toBe(true);
        expect(deepEqual({ a: 1 }, { a: 1 })).toBe(true);
        expect(deepEqual({ a: 1 }, observable({ a: 1 }))).toBe(true);
        expect(deepEqual(observable({ a: 1 }), observable({ a: 1 }))).toBe(true);
        expect(deepEqual(observable({ a: 1 }), { a: 1 })).toBe(true);
        expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
        expect(deepEqual({ a: 1 }, observable({ a: 2 }))).toBe(false);
        expect(deepEqual(observable({ a: 1 }), observable({ a: 2 }))).toBe(false);
        expect(deepEqual(observable({ a: 1 }), { a: 2 })).toBe(false);
        expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
        expect(deepEqual({ a: 1 }, observable({ b: 1 }))).toBe(false);
        expect(deepEqual(observable({ a: 1 }), observable({ b: 1 }))).toBe(false);
        expect(deepEqual(observable({ a: 1 }), { b: 1 })).toBe(false);
        expect(deepEqual({ a: 1 }, { a: 1, b: 1 })).toBe(false);
        expect(deepEqual({ a: 1 }, observable({ a: 1, b: 1 }))).toBe(false);
        expect(deepEqual(observable({ a: 1 }), observable({ a: 1, b: 1 }))).toBe(false);
        expect(deepEqual(observable({ a: 1 }), { a: 1, b: 1 })).toBe(false);
        expect(deepEqual({ a: 1, b: 1 }, { b: 1 })).toBe(false);
        expect(deepEqual({ a: 1, b: 1 }, observable({ b: 1 }))).toBe(false);
        expect(deepEqual(observable({ a: 1, b: 1 }), observable({ b: 1 }))).toBe(false);
        expect(deepEqual(observable({ a: 1, b: 1 }), { b: 1 })).toBe(false);
    });

    it("maps", () => {
        let ma1 = observable.map({ a: 1 });
        let ma1c = observable.map({ a: 1 });
        let ma2 = observable.map({ a: 2 });
        expect(deepEqual(ma1, ma1c)).toBe(true);
        expect(deepEqual(ma1, ma2)).toBe(false);
        expect(deepEqual({ a: 1 }, ma1)).toBe(true);
        expect(deepEqual(observable({ a: 1 }), ma1)).toBe(true);
        expect(deepEqual(ma1, { a: 1 })).toBe(true);
        expect(deepEqual(ma1, observable({ a: 1 }))).toBe(true);
    });
});
