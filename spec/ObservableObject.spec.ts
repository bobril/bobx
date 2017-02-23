import * as bobx from "../index";

describe("ObservableObject", () => {
    it("construct", () => {
        bobx.observable({ a: 1, b: "B" });
    });

    it("getset", () => {
        let v = bobx.observable({ a: 1, b: "B" });
        expect(v.a).toBe(1);
        expect(v.b).toBe("B");
        v.a = 42;
        expect(v.a).toBe(42);
    });
});