import { observable } from "../index";

class Person {
    @observable name: string;
}

class PersonDefault {
    @observable name = "B";
}

describe("ObservableClass", () => {
    it("construct", () => {
        new Person();
    });

    it("getset", () => {
        let o = new Person();
        expect(o.name).toBeUndefined();
        o.name = "Bobris";
        expect(o.name).toBe("Bobris");
    });

    it("multiple instances", () => {
        let p1 = new Person();
        let p2 = new Person();
        p1.name = "P1";
        p2.name = "P2";
        expect(p1.name).toBe("P1");
    });

    it("can have default value", () => {
        let pd = new PersonDefault();
        expect(pd.name).toBe("B");
        pd.name = "Bobris";
        expect(pd.name).toBe("Bobris");
    });
});