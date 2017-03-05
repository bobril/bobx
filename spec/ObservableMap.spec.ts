import { observable } from "../index";

describe("ObservableMap", () => {
    it("construct", () => {
        observable.map();
    });

    it("get set has", () => {
        let m = observable.map<number>();
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
        let m = observable.map({ a: 1, b: "B" });
        let prop = m.prop("b");
        expect(prop()).toBe("B");
        expect(prop("C")).toBe("C");
        expect(m.get("b")).toBe("C");
    });

    it("multiple instances", () => {
        let m1 = observable.map<string>();
        let m2 = observable.map<string>();
        m1.set("a", "b");
        m2.set("a", "c");
        expect(m1.get("a")).toBe("b");
    });

    it("init by object", () => {
        let m = observable.map({ a: "1", b: "2" });
        expect(m.size).toBe(2);
        expect(m.get("a")).toBe("1");
        expect(m.get("b")).toBe("2");
    });

    it("init by array", () => {
        let m = observable.map<string>([["a", "1"], ["b", "2"]]);
        expect(m.size).toBe(2);
        expect(m.get("a")).toBe("1");
        expect(m.get("b")).toBe("2");
    });

    it("delete", () => {
        let m = observable.map({ a: 2, b: 4 });
        expect(m.size).toBe(2);
        expect(m.delete("a")).toBe(true);
        expect(m.size).toBe(1);
        expect(m.delete("a")).toBe(false);
        expect(m.delete("c")).toBe(false);
    });

    it("foreach", () => {
        let m = observable.map({ a: 2, b: 4 });
        let a: (string | number)[] = [];
        m.forEach((v, k, m2) => {
            a.push(k, v);
            expect(m).toBe(m2);
        })
        expect(a).toEqual(["a", 2, "b", 4]);
    });

    it("clear", () => {
        let m = observable.map({ a: 2, b: 4 });
        m.clear();
        expect(m.size).toBe(0);
        m.forEach(() => fail());
    });

});
