import * as b from "bobril";
import * as bobx from "../index";

describe("ObservableObject", () => {
    it("construct", () => {
        bobx.observable({ a: 1, b: "B" });
    });

    it("get set", () => {
        let v = bobx.observable({ a: 1, b: "B" });
        expect(v.a).toBe(1);
        expect(v.b).toBe("B");
        v.a = 42;
        expect(v.a).toBe(42);
    });

    it("prop", () => {
        let v = bobx.observable({ a: 1, b: "B" });
        let prop = bobx.observableProp(v, "b");
        expect(prop()).toBe("B");
        expect(prop(undefined)).toBeUndefined();
        expect(prop()).toBeUndefined();
        expect(prop("C")).toBe("C");
        expect(v.b).toBe("C");
    });

    it("creates prop for new properties", () => {
        let v = bobx.observable({ a: 1, b: "B" }) as { a: number; b: string; c?: number };
        let prop = bobx.observableProp(v, "c");
        expect(prop()).toBe(undefined);
        expect(prop(42)).toBe(42);
        expect(v.c).toBe(42);
        expect(prop(undefined)).toBeUndefined();
        expect(v.c).toBeUndefined();
    });

    it("toJSON", () => {
        let o = { a: 1, b: "B" };
        let oo = bobx.observable(o);
        expect(JSON.stringify(oo)).toBe(JSON.stringify(o));
    });

    it("properties are observable", () => {
        let v = bobx.observable({ a: 1, b: "B" });
        let count = 0;
        let gotValue: number | undefined;
        const r = bobx.reaction(
            () => v.a,
            (value) => {
                count++;
                gotValue = value;
            }
        );
        b.syncUpdate();
        expect([count, gotValue]).toEqual([1, 1]);
        v.a = 42;
        b.syncUpdate();
        expect([count, gotValue]).toEqual([2, 42]);
        r.dispose();
    });

    it("new properties are automatically observable", () => {
        let v = bobx.observable({ a: 1, b: "B" }) as { a: number; b: string; c?: number };
        let count = 0;
        let gotValue: number | undefined;
        const r = bobx.reaction(
            () => v.c,
            (value) => {
                count++;
                gotValue = value;
            }
        );
        b.syncUpdate();
        expect([count, gotValue]).toEqual([1, undefined]);
        v.c = 42;
        b.syncUpdate();
        expect([count, gotValue]).toEqual([2, 42]);
        r.dispose();
    });

    it("object prototype properties must be object properties", () => {
        var v = bobx.observable({ a: 1 });
        expect(v.constructor).toBe({}.constructor);
    });

    it("equals", () => {
        let o = bobx.observable({ a: 1 });
        expect(o).toEqual({ a: 1 });
    });

    it("works with deepEqual when stringified", () => {
        var v = bobx.observable({ a: 1, b: "B" });
        JSON.stringify(v);
        expect(bobx.deepEqual(v, { a: 1, b: "B" })).toBeTrue();
    });

    it("hasOwnProperty", () => {
        var v = bobx.observable({ a: 1, b: "B" });
        expect(v.hasOwnProperty("a")).toBeTrue();
        expect(v.hasOwnProperty("hasOwnProperty")).toBeFalse();
        expect(v.hasOwnProperty("toString")).toBeFalse();
    });

    it("getter works as computed", () => {
        bobx.reactiveScope(() => {
            let runs = 0;
            var v = bobx.observable({
                a: 1,
                get b() {
                    runs++;
                    return this.a + 1;
                },
            });
            expect(runs).toBe(0);
            expect(v.b).toBe(2);
            expect(runs).toBe(1);
            v.a = 2;
            expect(v.b).toBe(3);
            expect(runs).toBe(2);
            expect(v.b).toBe(3);
            expect(runs).toBe(2);
            expect(() => ((v as any).b = 3)).toThrow();
        });
    });

    it("not possible to freeze", () => {
        var v = bobx.observable({ a: 1, b: "B" });
        expect(() => Object.freeze(v)).toThrow();
    });

    it("enumerable only on observable properties", () => {
        var v = bobx.observable({ a: 1, b: "B" });
        expect(Reflect.ownKeys(v).length).toBe(2);
        let symbols = Object.getOwnPropertySymbols(v);
        expect(symbols.length).toBe(0);
        let props = Object.getOwnPropertyNames(v);
        expect(props).toEqual(["a", "b"]);
        var props2 = [];
        for (const key in v) {
            props2.push(key);
        }
        expect(props2).toEqual(["a", "b"]);
    });
});
