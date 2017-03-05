import { observable, observableProp } from "../index";

describe("ObservableArray", () => {
    it("construct", () => {
        observable([]);
    });

    it("get set", () => {
        let a = observable([42]);
        expect(a.length).toBe(1);
        expect(a[0]).toBe(42);
        a[0] = 1;
        expect(a[0]).toBe(1);
    });

    it("multiple instances", () => {
        let a1 = observable([] as Array<number>);
        let a2 = observable([] as Array<number>);
        a1.push(1);
        a2.push(2);
        expect(a1[0]).toBe(1);
    });

    it("prop", () => {
        let v = observable([42]);
        let prop = observableProp(v, 0);
        expect(prop()).toBe(42);
        expect(prop(1)).toBe(1);
        expect(v[0]).toBe(1);
    });
});
