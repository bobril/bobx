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
});
