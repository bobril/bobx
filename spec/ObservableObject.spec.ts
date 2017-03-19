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
        expect(prop("C")).toBe("C");
        expect(v.b).toBe("C");
    });

    it("toJSON", () => {
        let o = { a: 1, b: "B" };
        let oo = bobx.observable(o);
        expect(JSON.stringify(oo)).toBe(JSON.stringify(o));
    });
});
