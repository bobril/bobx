import * as b from "bobril";
import { observable, observableProp, isObservable, reaction } from "../index";

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

    it("toJSON", () => {
        let v = observable([42]);
        expect(JSON.stringify(v)).toBe(JSON.stringify([42]));
    });

    it("enhancing push", () => {
        let a = observable([] as Array<{ b: number }>);
        a.push({ b: 1 }, { b: 2 });
        expect(isObservable(a[1])).toBe(true);
        expect(a[1]!.b).toBe(2);
    });

    it("splice the splice", () => {
        let a = observable([1, 2, 3]);
        let index = 1;
        a.splice(index - 1, 0, a.splice(index, 1)[0]!);
        expect(a[0]).toBe(2);
        expect(a[1]).toBe(1);
        expect(a[2]).toBe(3);
    });

    it("ObservableArray.some is observable", () => {
        let a = observable([1, 2, 3]);
        let count = 0;
        let gotValue: boolean | undefined;
        const r = reaction(
            () => a.some((value) => value == 42),
            (value) => {
                count++;
                gotValue = value;
            }
        );
        b.syncUpdate();
        expect([count, gotValue]).toEqual([1, false]);
        a.push(42);
        b.syncUpdate();
        expect([count, gotValue]).toEqual([2, true]);
        r.dispose();
    });

    it("slice", () => {
        let a = observable(["hi", { aa: "bb" }]);
        let b = a.slice();
        expect(b).toEqual(["hi", { aa: "bb" }]);
    });

    it("hasOwnProperty", () => {
        var v = observable(["hi"]);
        expect(v.hasOwnProperty("0")).toBeTrue();
        expect(v.hasOwnProperty("hasOwnProperty")).toBeFalse();
        expect(v.hasOwnProperty("toString")).toBeFalse();
    });

    it("more complex equal", () => {
        let a = observable(["hi", { aa: "bb" }]);
        expect((a[1] as any).bb).toBeUndefined();
        expect(a).toEqual(["hi", { aa: "bb" }]);
    });
});
