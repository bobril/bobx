import { observable, IMap } from "../index";

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
        let mm = new Map<string, string | number>();
        mm.set("a", 1);
        mm.set("b", "B");
        let m = observable(mm);
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
        let mm = new Map<string, number>();
        mm.set("a", 2);
        mm.set("b", 4);
        let m = observable(mm);
        expect(m.size).toBe(2);
        expect(m.delete("a")).toBe(true);
        expect(m.size).toBe(1);
        expect(m.delete("a")).toBe(false);
        expect(m.delete("c")).toBe(false);
    });

    it("foreach", () => {
        let mm = new Map<string, number>();
        mm.set("a", 2);
        mm.set("b", 4);
        let m = observable(mm);
        let a: (string | number)[] = [];
        m.forEach((v, k, m2) => {
            a.push(k, v);
            expect(m as IMap<string, number>).toBe(m2);
        });
        expect(a).toEqual(["a", 2, "b", 4]);
    });

    it("clear", () => {
        let mm = new Map<string, number>();
        mm.set("a", 2);
        mm.set("b", 4);
        let m = observable(mm);
        m.clear();
        expect(m.size).toBe(0);
        m.forEach(() => fail());
    });
});
