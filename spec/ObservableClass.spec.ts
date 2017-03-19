import * as b from 'bobril';
import { observable, observableProp } from "../index";

class Person {
    @observable name: string;
}

class PersonDefault {
    @observable name = "B";
}

class Depth {
    @observable.deep deep: { a: string }[];
    @observable.shallow shallow: { a: string }[];
    @observable.ref ref: { a: string }[];
}

describe("ObservableClass", () => {
    it("construct", () => {
        new Person();
    });

    it("get set", () => {
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

    it("prop without default value", () => {
        let o = new Person();
        let prop = observableProp(o, "name");
        expect(prop()).toBe(undefined);
        expect(prop("Bobris")).toBe("Bobris");
        expect(o.name).toBe("Bobris");
    });

    it("prop with default value", () => {
        let o = new PersonDefault();
        let prop = observableProp(o, "name");
        expect(prop()).toBe("B");
        expect(prop("Bobris")).toBe("Bobris");
        expect(o.name).toBe("Bobris");
    });

    it("toJSON", () => {
        let o = new PersonDefault();
        expect(JSON.stringify(o)).toBe(`{"name":"B"}`);
    });
});

function invalidates(observing: () => void, modification: () => void) {
    let invalidated = false;
    let invBackup = b.setInvalidate((ctx?: Object, deepness?: number) => { invalidated = true; invBackup(ctx, deepness); });
    b.init(() => {
        observing();
        return "";
    });
    b.syncUpdate();
    invalidated = false;
    modification();
    b.setInvalidate(invBackup);
    return invalidated;
}

describe("Observable Depth", () => {
    it("Deep", () => {
        let o = new Depth();
        o.deep = [{ a: "A" }];
        expect(invalidates(() => o.deep, () => o.deep = [{ a: "B1" }])).toBeTruthy();
        expect(invalidates(() => o.deep[0], () => o.deep = [{ a: "B2" }])).toBeTruthy();
        expect(invalidates(() => o.deep[0].a, () => o.deep = [{ a: "B3" }])).toBeTruthy();

        expect(invalidates(() => o.deep, () => o.deep[0] = { a: "B4" })).toBeFalsy();
        expect(invalidates(() => o.deep[0], () => o.deep[0] = { a: "B5" })).toBeTruthy();
        expect(invalidates(() => o.deep[0].a, () => o.deep[0] = { a: "B6" })).toBeTruthy();

        expect(invalidates(() => o.deep, () => o.deep[0].a = "B7")).toBeFalsy();
        expect(invalidates(() => o.deep[0], () => o.deep[0].a = "B8")).toBeFalsy();
        expect(invalidates(() => o.deep[0].a, () => o.deep[0].a = "B9")).toBeTruthy();
    });

    it("Shallow", () => {
        let o = new Depth();
        o.shallow = [{ a: "A" }];
        expect(invalidates(() => o.shallow, () => o.shallow = [{ a: "B1" }])).toBeTruthy();
        expect(invalidates(() => o.shallow[0], () => o.shallow = [{ a: "B2" }])).toBeTruthy();
        expect(invalidates(() => o.shallow[0].a, () => o.shallow = [{ a: "B3" }])).toBeTruthy();

        expect(invalidates(() => o.shallow, () => o.shallow[0] = { a: "B4" })).toBeFalsy();
        expect(invalidates(() => o.shallow[0], () => o.shallow[0] = { a: "B5" })).toBeTruthy();
        expect(invalidates(() => o.shallow[0].a, () => o.shallow[0] = { a: "B6" })).toBeTruthy();

        expect(invalidates(() => o.shallow, () => o.shallow[0].a = "B7")).toBeFalsy();
        expect(invalidates(() => o.shallow[0], () => o.shallow[0].a = "B8")).toBeFalsy();
        expect(invalidates(() => o.shallow[0].a, () => o.shallow[0].a = "B9")).toBeFalsy();
    });

    it("Ref", () => {
        let o = new Depth();
        o.ref = [{ a: "A" }];
        expect(invalidates(() => o.ref, () => o.ref = [{ a: "B1" }])).toBeTruthy();
        expect(invalidates(() => o.ref[0], () => o.ref = [{ a: "B2" }])).toBeTruthy();
        expect(invalidates(() => o.ref[0].a, () => o.ref = [{ a: "B3" }])).toBeTruthy();

        expect(invalidates(() => o.ref, () => o.ref[0] = { a: "B4" })).toBeFalsy();
        expect(invalidates(() => o.ref[0], () => o.ref[0] = { a: "B5" })).toBeFalsy();
        expect(invalidates(() => o.ref[0].a, () => o.ref[0] = { a: "B6" })).toBeFalsy();

        expect(invalidates(() => o.ref, () => o.ref[0].a = "B7")).toBeFalsy();
        expect(invalidates(() => o.ref[0], () => o.ref[0].a = "B8")).toBeFalsy();
        expect(invalidates(() => o.ref[0].a, () => o.ref[0].a = "B9")).toBeFalsy();
    });
});
