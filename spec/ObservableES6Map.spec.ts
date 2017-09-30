import { observable } from "../index";

describe("ObservableES6Map", () => {
    it("construct", () => {
        observable(new Map());
    });

    it("get set has", () => {
        let m = observable(new Map<string, number>());
        expect(m.size).toBe(0);
        m.set("a", 1);
        expect(m.has("a")).toBe(true);
        expect(m.has("b")).toBe(false);
        expect(m.get("a")).toBe(1);
        expect(m.size).toBe(1);
        m.set("a", 2);
        expect(m.get("a")).toBe(2);
    });

    it("prop", () => {
        let m = observable(new Map<string, string | number>([["a", 1], ["b", "B"]]));
        let prop = m.prop("b");
        expect(prop()).toBe("B");
        expect(prop("C")).toBe("C");
        expect(m.get("b")).toBe("C");
    });

    it("multiple instances", () => {
        let m1 = observable(new Map<string, string>());
        let m2 = observable(new Map<string, string>());
        m1.set("a", "b");
        m2.set("a", "c");
        expect(m1.get("a")).toBe("b");
    });

    it("delete", () => {
        let m = observable(new Map<string, number>([["a", 2], ["b", 4]]));
        expect(m.size).toBe(2);
        expect(m.delete("a")).toBe(true);
        expect(m.size).toBe(1);
        expect(m.delete("a")).toBe(false);
        expect(m.delete("c")).toBe(false);
    });

    it("foreach", () => {
        let m = observable(new Map<string, number>([["a", 2], ["b", 4]]));
        let a: (string | number)[] = [];
        m.forEach((v, k, m2) => {
            a.push(k, v);
            expect(m).toBe(m2);
        })
        expect(a).toEqual(["a", 2, "b", 4]);
    });

    it("clear", () => {
        let m = observable(new Map<string, number>([["a", 2], ["b", 4]]));
        m.clear();
        expect(m.size).toBe(0);
        m.forEach(() => fail());
    });
});
